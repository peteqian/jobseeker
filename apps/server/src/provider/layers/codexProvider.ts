import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CODEX_MODELS } from "@jobseeker/contracts";
import * as Layer from "effect/Layer";

import { getProviderSettings } from "../../lib/provider-settings";
import { CodexProvider } from "../services/codexProvider";
import type { ChatProvider } from "../types";
import { resolveProviderModel, resolveReasoningEffort } from "../utils";

function ensureCodexAuthInHome(codexHome: string, sourceHome?: string): void {
  mkdirSync(codexHome, { recursive: true });
  const homeDir = process.env.HOME;
  if (!homeDir) return;

  const normalizedSourceHome = sourceHome?.trim();
  const candidates: Array<{ src: string; dest: string }> = [
    ...(normalizedSourceHome
      ? [
          {
            src: path.join(normalizedSourceHome, "auth.json"),
            dest: path.join(codexHome, "auth.json"),
          },
          {
            src: path.join(normalizedSourceHome, "config.toml"),
            dest: path.join(codexHome, "config.toml"),
          },
        ]
      : []),
    { src: path.join(homeDir, ".codex", "auth.json"), dest: path.join(codexHome, "auth.json") },
    {
      src: path.join(homeDir, ".codex", "config.toml"),
      dest: path.join(codexHome, "config.toml"),
    },
    {
      src: path.join(homeDir, ".config", "codex", "auth.json"),
      dest: path.join(codexHome, "auth.json"),
    },
    {
      src: path.join(homeDir, ".config", "codex", "config.toml"),
      dest: path.join(codexHome, "config.toml"),
    },
  ];

  for (const { src, dest } of candidates) {
    if (!existsSync(src) || existsSync(dest)) continue;
    copyFileSync(src, dest);
  }
}

export function makeCodexProvider(): ChatProvider {
  return {
    id: "codex",
    models: async () => CODEX_MODELS,
    available() {
      const settings = getProviderSettings();
      if (!settings.codex.enabled) return false;
      const binPath = settings.codex.binaryPath || process.env.CODEX_BIN || "codex";
      try {
        const proc = Bun.spawnSync([binPath, "--version"], { stdout: "pipe", stderr: "pipe" });
        return proc.exitCode === 0;
      } catch {
        return false;
      }
    },
    run(systemPrompt, history, selection, runtime, signal) {
      const settings = getProviderSettings();
      const binPath = settings.codex.binaryPath || process.env.CODEX_BIN || "codex";
      const parts: string[] = [systemPrompt, ""];
      for (const msg of history.slice(0, -1)) {
        parts.push(`${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`);
      }
      const last = history.at(-1);
      if (last) parts.push(`User: ${last.content}`);

      const model = resolveProviderModel(CODEX_MODELS, selection);
      const effort = resolveReasoningEffort(model, selection);
      if (runtime?.codexHome) {
        ensureCodexAuthInHome(runtime.codexHome, settings.codex.homePath);
      }

      const proc = Bun.spawn(
        [
          binPath,
          "exec",
          "--json",
          "--ephemeral",
          "-s",
          "read-only",
          "--skip-git-repo-check",
          "--model",
          model.slug,
          "--config",
          `model_reasoning_effort="${effort}"`,
          "-",
        ],
        {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
          ...(runtime?.cwd ? { cwd: runtime.cwd } : {}),
          ...(runtime?.codexHome ? { env: { ...process.env, CODEX_HOME: runtime.codexHome } } : {}),
        },
      );

      proc.stdin.write(new TextEncoder().encode(parts.join("\n")));
      proc.stdin.end();

      let interrupted = false;
      const onAbort = () => {
        interrupted = true;
        proc.kill();
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      let fullText = "";
      const resultPromise = (async () => {
        const exitCode = await proc.exited;
        signal?.removeEventListener("abort", onAbort);
        if (interrupted || signal?.aborted) {
          throw new Error("Provider turn interrupted");
        }
        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text();
          throw new Error(`Codex exited with code ${exitCode}: ${stderr || "unknown error"}`);
        }
        return { text: fullText };
      })();

      const stream = (async function* () {
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let sawDeltas = false;

        function* handleEvent(event: any): Generator<string> {
          if (event.type === "response.output_text.delta" && event.delta) {
            const delta = typeof event.delta === "string" ? event.delta : (event.delta?.text ?? "");
            if (delta) {
              sawDeltas = true;
              fullText += delta;
              yield delta;
            }
            return;
          }
          if (event.type === "item.completed" && event.item?.text && !sawDeltas) {
            fullText += event.item.text;
            yield event.item.text;
          }
        }

        while (true) {
          if (signal?.aborted) {
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              yield* handleEvent(JSON.parse(line));
            } catch {
              // Ignore non-JSON lines.
            }
          }
        }
      })();

      return Object.assign(stream, { result: resultPromise });
    },
  };
}

export const CodexProviderLive = Layer.succeed(CodexProvider, makeCodexProvider());
