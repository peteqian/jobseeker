import { CODEX_MODELS } from "@jobseeker/contracts";
import * as Layer from "effect/Layer";

import { getProviderSettings } from "../../lib/provider-settings";
import { createCodexSession } from "../codex";
import { CodexProvider } from "../services/codexProvider";
import type { ChatModelSelection } from "@jobseeker/contracts";
import type { ChatProvider, ProviderRuntimeOptions, ProviderStreamEvent } from "../types";
import { resolveProviderModel, resolveReasoningEffort } from "../utils";

/**
 * Renders the prompt for a codex turn. On resume, codex already holds the
 * prior turns server-side, so we send only the newest user message (plus the
 * live system prompt, which carries updated resume/profile/agenda context).
 */
function renderCodexPrompt(
  systemPrompt: string,
  history: { role: string; content: string }[],
  resuming: boolean,
) {
  if (resuming) {
    const last = history.at(-1);
    return [systemPrompt, "", `User: ${last?.content ?? ""}`].join("\n");
  }
  const parts: string[] = [systemPrompt, ""];
  for (const msg of history.slice(0, -1)) {
    parts.push(`${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`);
  }
  const last = history.at(-1);
  if (last) parts.push(`User: ${last.content}`);
  return parts.join("\n");
}

function resolveCodexConfig(
  selection: ChatModelSelection | undefined,
  runtime: ProviderRuntimeOptions | undefined,
) {
  const settings = getProviderSettings();
  const binaryPath = settings.codex.binaryPath || process.env.CODEX_BIN || "codex";
  const model = resolveProviderModel(CODEX_MODELS, selection);
  const reasoningEffort = resolveReasoningEffort(model, selection);
  // Use the single real codex home (where `codex login` wrote auth) as
  // CODEX_HOME. codex reads + rotates its OAuth token in place there, and all
  // session rollouts live under it so resumeThread() can find them by id.
  // (Previously each thread got a copied auth.json, which fragmented the
  // refresh token and broke auth — see resolveCodexHome in provider-settings.)
  return {
    binaryPath,
    model: model.slug,
    reasoningEffort,
    codexHome: settings.codex.homePath,
    resumeId: runtime?.resume?.sessionId,
  };
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
      const cfg = resolveCodexConfig(selection, runtime);
      const session = createCodexSession({
        binaryPath: cfg.binaryPath,
        model: cfg.model,
        reasoningEffort: cfg.reasoningEffort,
        cwd: runtime?.cwd,
        codexHome: cfg.codexHome,
        resumeId: cfg.resumeId,
      });
      const prompt = renderCodexPrompt(systemPrompt, history, Boolean(cfg.resumeId));
      const turn = session.runPrompt(prompt, { signal });
      return Object.assign(turn, {
        result: turn.result.then((r) => ({
          text: r.text,
          sessionId: session.threadId ?? cfg.resumeId,
        })),
      });
    },
    runEvents(systemPrompt, history, selection, runtime, signal) {
      const cfg = resolveCodexConfig(selection, runtime);
      const session = createCodexSession({
        binaryPath: cfg.binaryPath,
        model: cfg.model,
        reasoningEffort: cfg.reasoningEffort,
        cwd: runtime?.cwd,
        codexHome: cfg.codexHome,
        resumeId: cfg.resumeId,
      });
      const events = session.runEvents(
        renderCodexPrompt(systemPrompt, history, Boolean(cfg.resumeId)),
        {
          signal,
        },
      );
      // Emit only the new suffix of each item's text, so consumers get deltas.
      const emitted = new Map<string, number>();

      const stream = (async function* (): AsyncGenerator<ProviderStreamEvent> {
        for await (const event of events) {
          if (
            event.type !== "item.started" &&
            event.type !== "item.updated" &&
            event.type !== "item.completed"
          ) {
            continue;
          }
          const item = event.item;
          if (item.type === "agent_message" || item.type === "reasoning") {
            const key = `${item.type}:${item.id}`;
            const prev = emitted.get(key) ?? 0;
            if (item.text.length <= prev) continue;
            emitted.set(key, item.text.length);
            const text = item.text.slice(prev);
            yield item.type === "reasoning"
              ? { type: "reasoning", text }
              : { type: "message", text };
          } else if (item.type === "command_execution") {
            yield { type: "tool", label: item.command };
          }
        }
      })();

      return Object.assign(stream, {
        result: events.result.then((r) => ({
          text: r.text,
          sessionId: session.threadId ?? cfg.resumeId,
        })),
      });
    },
  };
}

export const CodexProviderLive = Layer.succeed(CodexProvider, makeCodexProvider());
