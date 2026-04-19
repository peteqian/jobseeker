import { CLAUDE_MODELS } from "@jobseeker/contracts";
import * as Layer from "effect/Layer";

import { getProviderSettings } from "../../lib/provider-settings";
import { ClaudeProvider } from "../services/claudeProvider";
import type { ChatProvider } from "../types";
import { resolveProviderModel } from "../utils";

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
      let fullText = "";
      let resolveResult: (value: { text: string }) => void;
      let rejectResult: (reason?: unknown) => void;
      const resultPromise = new Promise<{ text: string }>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      const stream = (async function* () {
        const settings = getProviderSettings();
        const binPath = settings.claude.binaryPath;
        const model = resolveProviderModel(CLAUDE_MODELS, selection);
        const prompt = [
          systemPrompt,
          "",
          ...history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`),
        ].join("\n");

        const proc = Bun.spawn([binPath, "--print", "--model", model.slug], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
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

          fullText = stdout.trim();
          if (fullText.length > 0) yield fullText;
          resolveResult!({ text: fullText });
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
