import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import {
  Codex,
  type ModelReasoningEffort,
  type Thread,
  type ThreadEvent,
  type ThreadItem,
} from "@openai/codex-sdk";
import { z } from "zod";

function buildCodexEnvironment(codexHome?: string): Record<string, string> | undefined {
  if (!codexHome) return undefined;

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.CODEX_HOME = codexHome;
  return env;
}

export function ensureCodexAuthInHome(codexHome: string, sourceHome?: string): void {
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

function readAgentMessageText(item: ThreadItem): string | null {
  return item.type === "agent_message" ? item.text : null;
}

function toCodexReasoningEffort(value: string): ModelReasoningEffort {
  switch (value) {
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    default:
      return "medium";
  }
}

function eventToError(event: ThreadEvent): Error | null {
  if (event.type === "turn.failed") {
    return new Error(event.error.message);
  }
  if (event.type === "error") {
    return new Error(event.message);
  }
  return null;
}

export interface CodexThreadHandle {
  readonly thread: Thread;
  runTurn<T>(input: {
    prompt: string;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
  }): Promise<{ parsed: T; finalResponse: string }>;
}

export function createCodexThread(input: {
  readonly binaryPath: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly cwd?: string;
  readonly codexHome?: string;
}): CodexThreadHandle {
  const env = buildCodexEnvironment(input.codexHome);
  const sdk = new Codex({
    codexPathOverride: input.binaryPath,
    ...(env ? { env } : {}),
  });

  const thread = sdk.startThread({
    model: input.model,
    sandboxMode: "read-only",
    workingDirectory: input.cwd,
    skipGitRepoCheck: true,
    modelReasoningEffort: toCodexReasoningEffort(input.reasoningEffort),
    approvalPolicy: "never",
  });

  return {
    thread,
    async runTurn<T>({
      prompt,
      schema,
      signal,
    }: {
      prompt: string;
      schema: z.ZodType<T>;
      signal?: AbortSignal;
    }) {
      const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
      const turn = await thread.run(prompt, { outputSchema: jsonSchema, signal });
      const finalResponse = turn.finalResponse;
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(finalResponse);
      } catch (error) {
        throw new Error(
          `Codex turn response was not valid JSON: ${(error as Error).message}\nResponse: ${finalResponse.slice(0, 500)}`,
          { cause: error },
        );
      }
      const result = schema.safeParse(parsedJson);
      if (!result.success) {
        throw new Error(
          `Codex turn response failed schema validation: ${result.error.message}\nResponse: ${finalResponse.slice(0, 500)}`,
        );
      }
      return { parsed: result.data, finalResponse };
    },
  };
}

export function runCodexPrompt(input: {
  readonly binaryPath: string;
  readonly prompt: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly cwd?: string;
  readonly codexHome?: string;
  readonly signal?: AbortSignal;
}): AsyncIterable<string> & {
  result: Promise<{ text: string }>;
} {
  const env = buildCodexEnvironment(input.codexHome);
  const sdk = new Codex({
    codexPathOverride: input.binaryPath,
    ...(env ? { env } : {}),
  });

  const thread = sdk.startThread({
    model: input.model,
    sandboxMode: "read-only",
    workingDirectory: input.cwd,
    skipGitRepoCheck: true,
    modelReasoningEffort: toCodexReasoningEffort(input.reasoningEffort),
    approvalPolicy: "never",
  });

  let resolveResult!: (value: { text: string }) => void;
  let rejectResult!: (error: unknown) => void;
  const result = new Promise<{ text: string }>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const stream = (async function* () {
    let finalText = "";
    const emittedLengths = new Map<string, number>();

    try {
      const { events } = await thread.runStreamed(input.prompt, { signal: input.signal });
      for await (const event of events) {
        const error = eventToError(event);
        if (error) {
          throw error;
        }

        if (
          event.type !== "item.started" &&
          event.type !== "item.updated" &&
          event.type !== "item.completed"
        ) {
          continue;
        }

        const text = readAgentMessageText(event.item);
        if (text === null) {
          continue;
        }

        finalText = text;
        const previousLength = emittedLengths.get(event.item.id) ?? 0;
        emittedLengths.set(event.item.id, text.length);

        if (text.length <= previousLength) {
          continue;
        }

        const delta = text.slice(previousLength);
        if (delta) {
          yield delta;
        }
      }

      resolveResult({ text: finalText });
    } catch (error) {
      rejectResult(error);
      throw error;
    }
  })();

  return Object.assign(stream, { result });
}
