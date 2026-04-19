import type { ChatModelSelection } from "@jobseeker/contracts";
import * as Layer from "effect/Layer";

import { connectToOpenCodeServer, createOpenCodeSdkClient } from "../../lib/opencode";
import { getProviderSettings } from "../../lib/provider-settings";
import { OpenCodeProvider } from "../services/openCodeProvider";
import {
  loadOpenCodeModels,
  OPENCODE_FALLBACK_MODELS,
  parseOpenCodeModelSlug,
} from "../opencodeRuntime";
import type { ChatProvider, ProviderRuntimeOptions } from "../types";
import { mergeProviderModels, resolveProviderModel } from "../utils";

function renderPrompt(systemPrompt: string, history: { role: string; content: string }[]): string {
  return [
    systemPrompt,
    "",
    ...history.map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`),
  ].join("\n");
}

function readAssistantTextFromMessages(
  messages: Array<{
    info: { role: "user" | "assistant" };
    parts: Array<{ type: string; text?: string }>;
  }>,
): string {
  const assistant = [...messages].reverse().find((m) => m.info.role === "assistant");
  if (!assistant) return "";
  return assistant.parts
    .filter((part) => part.type === "text" || part.type === "reasoning")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function runAgainstOpenCode(
  systemPrompt: string,
  history: { role: string; content: string }[],
  selection: ChatModelSelection | undefined,
  runtime: ProviderRuntimeOptions | undefined,
  signal?: AbortSignal,
): Promise<{ text: string }> {
  if (signal?.aborted) {
    throw new Error("Provider turn interrupted");
  }

  const settings = getProviderSettings();
  const connection = await connectToOpenCodeServer({
    binaryPath: settings.opencode.binaryPath,
    serverUrl: settings.opencode.serverUrl,
  });

  try {
    const client = createOpenCodeSdkClient({
      baseUrl: connection.url,
      directory: runtime?.cwd ?? process.cwd(),
      serverPassword: settings.opencode.serverPassword,
    });

    const models = await loadOpenCodeModels({
      settings,
      connection,
      cwd: runtime?.cwd,
    }).catch(() => mergeProviderModels(OPENCODE_FALLBACK_MODELS, settings.opencode.customModels));
    const model = resolveProviderModel(models, selection);
    const parsed = parseOpenCodeModelSlug(model.slug) ?? {
      providerID: "openai",
      modelID: model.slug,
    };

    const session = await client.session.create({ title: "Jobseeker Chat" });
    if (!session.data) {
      throw new Error("OpenCode session.create returned no session payload.");
    }

    await client.session.prompt({
      sessionID: session.data.id,
      model: { providerID: parsed.providerID, modelID: parsed.modelID },
      parts: [{ type: "text", text: renderPrompt(systemPrompt, history) }],
    });

    if (signal?.aborted) {
      throw new Error("Provider turn interrupted");
    }

    const messages = await client.session.messages({ sessionID: session.data.id });
    return { text: readAssistantTextFromMessages(messages.data ?? []) };
  } finally {
    connection.close();
  }
}

export function makeOpenCodeProvider(): ChatProvider {
  return {
    id: "opencode",
    models: async () =>
      loadOpenCodeModels().catch(() =>
        mergeProviderModels(OPENCODE_FALLBACK_MODELS, getProviderSettings().opencode.customModels),
      ),
    available() {
      const settings = getProviderSettings();
      if (!settings.opencode.enabled) return false;
      if (settings.opencode.serverUrl.trim()) return true;
      const binPath = settings.opencode.binaryPath || process.env.OPENCODE_BIN || "opencode";
      try {
        const proc = Bun.spawnSync([binPath, "--version"], { stdout: "pipe", stderr: "pipe" });
        return proc.exitCode === 0;
      } catch {
        return false;
      }
    },
    run(systemPrompt, history, selection, runtime, signal) {
      const providerSelection = selection?.provider === "opencode" ? selection : undefined;
      const resultPromise = runAgainstOpenCode(
        systemPrompt,
        history,
        providerSelection,
        runtime,
        signal,
      );
      const stream = (async function* () {
        const result = await resultPromise;
        const text = result.text.trim();
        if (text.length > 0) yield text;
      })();
      return Object.assign(stream, { result: resultPromise });
    },
  };
}

export const OpenCodeProviderLive = Layer.succeed(OpenCodeProvider, makeOpenCodeProvider());
