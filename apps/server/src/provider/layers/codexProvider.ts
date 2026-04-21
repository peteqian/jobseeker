import { CODEX_MODELS } from "@jobseeker/contracts";
import * as Layer from "effect/Layer";

import { ensureCodexAuthInHome, runCodexPrompt } from "../../lib/codex";
import { getProviderSettings } from "../../lib/provider-settings";
import { CodexProvider } from "../services/codexProvider";
import type { ChatProvider } from "../types";
import { resolveProviderModel, resolveReasoningEffort } from "../utils";

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

      return runCodexPrompt({
        binaryPath: binPath,
        prompt: parts.join("\n"),
        model: model.slug,
        reasoningEffort: effort,
        cwd: runtime?.cwd,
        codexHome: runtime?.codexHome,
        signal,
      });
    },
  };
}

export const CodexProviderLive = Layer.succeed(CodexProvider, makeCodexProvider());
