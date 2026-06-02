import { CLAUDE_MODELS } from "@jobseeker/contracts";
import * as Layer from "effect/Layer";

import { getProviderSettings } from "../../lib/provider-settings";
import { ClaudeProvider } from "../services/claudeProvider";
import type { ChatProvider, ProviderTurnResult } from "../types";
import { resolveProviderModel } from "../utils";

/** Parses `claude --print --output-format json` stdout into text + session id.
 * Falls back to treating stdout as raw text if it isn't the expected JSON. */
export function parseClaudeJson(stdout: string): ProviderTurnResult {
  try {
    const parsed = JSON.parse(stdout) as { result?: string; session_id?: string };
    if (typeof parsed.result === "string") {
      return { text: parsed.result.trim(), sessionId: parsed.session_id };
    }
  } catch {
    // not JSON — fall through
  }
  return { text: stdout.trim() };
}

export function makeClaudeProvider(): ChatProvider {
  return {
    id: "claude",
    models: async () => CLAUDE_MODELS,
    available() {
      const settings = getProviderSettings();
      if (!settings.claude.enabled) return false;
      const binPath = settings.claude.binaryPath;
      try {
        const proc = Bun.spawn([binPath, "--version"], { stdout: "pipe", stderr: "pipe" });
        void proc.exited;
        return true;
      } catch {
        return false;
      }
    },
    run(systemPrompt, history, selection, runtime, signal) {
      let resolveResult: (value: ProviderTurnResult) => void;
      let rejectResult: (reason?: unknown) => void;
      const resultPromise = new Promise<ProviderTurnResult>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      const stream = (async function* () {
        const settings = getProviderSettings();
        const binPath = settings.claude.binaryPath;
        const model = resolveProviderModel(CLAUDE_MODELS, selection);
        const resumeId = runtime?.resume?.sessionId;
        // On resume, claude already holds prior turns; send only the newest
        // message (plus the live system prompt).
        const messages = resumeId ? history.slice(-1) : history;
        const prompt = [
          systemPrompt,
          "",
          ...messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`),
        ].join("\n");

        const args = ["--print", "--output-format", "json", "--model", model.slug];
        if (resumeId) args.push("--resume", resumeId);

        const proc = Bun.spawn([binPath, ...args], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, CLAUDE_CONFIG_DIR: settings.claude.configPath },
          ...(runtime?.cwd ? { cwd: runtime.cwd } : {}),
        });

        proc.stdin.write(new TextEncoder().encode(prompt));
        proc.stdin.end();

        let interrupted = false;
        const onAbort = () => {
          interrupted = true;
          proc.kill();
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        try {
          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();
          const exitCode = await proc.exited;
          if (interrupted || signal?.aborted) {
            throw new Error("Provider turn interrupted");
          }
          if (exitCode !== 0) {
            throw new Error(`Claude exited with code ${exitCode}: ${stderr || "unknown error"}`);
          }

          const result = parseClaudeJson(stdout);
          if (result.text.length > 0) yield result.text;
          resolveResult!(result);
        } catch (error) {
          rejectResult!(error);
          throw error;
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      })();

      return Object.assign(stream, { result: resultPromise });
    },
  };
}

export const ClaudeProviderLive = Layer.succeed(ClaudeProvider, makeClaudeProvider());
