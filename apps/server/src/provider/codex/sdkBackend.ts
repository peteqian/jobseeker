import { Codex, type Thread, type ThreadEvent, type ThreadItem } from "@openai/codex-sdk";
import { z } from "zod";

import { buildCodexEnvironment } from "./auth";
import {
  CodexError,
  toCodexReasoningEffort,
  type CodexBackend,
  type CodexEvent,
  type CodexEventStream,
  type CodexItem,
  type CodexSession,
  type CodexSessionConfig,
  type CodexStructuredTurnInput,
  type CodexStructuredTurnResult,
  type CodexTextStream,
  type CodexTurnOptions,
  type CodexUsage,
} from "./types";

function mapItem(item: ThreadItem): CodexItem | null {
  switch (item.type) {
    case "agent_message":
      return { type: "agent_message", id: item.id, text: item.text };
    case "reasoning":
      return { type: "reasoning", id: item.id, text: item.text };
    case "command_execution":
      return {
        type: "command_execution",
        id: item.id,
        command: item.command,
        output: item.aggregated_output,
        exitCode: item.exit_code ?? undefined,
      };
    case "file_change":
      return {
        type: "file_change",
        id: item.id,
        changes: item.changes.map((c) => ({ path: c.path, kind: c.kind })),
        status: item.status,
      };
    case "mcp_tool_call":
      return { type: "mcp_tool_call", id: item.id, server: item.server, tool: item.tool };
    case "web_search":
      return { type: "web_search", id: item.id, query: item.query };
    case "todo_list":
      return {
        type: "todo_list",
        id: item.id,
        items: item.items.map((t: { text: string; completed: boolean }) => ({
          text: t.text,
          done: t.completed,
        })),
      };
    case "error":
      return { type: "error", id: item.id, message: item.message };
    default:
      return null;
  }
}

function mapEvent(event: ThreadEvent): CodexEvent | null {
  switch (event.type) {
    case "thread.started":
      return { type: "thread.started", threadId: event.thread_id };
    case "turn.started":
      return { type: "turn.started" };
    case "item.started":
    case "item.updated":
    case "item.completed": {
      const item = mapItem(event.item);
      if (!item) return null;
      return { type: event.type, item };
    }
    case "turn.completed":
      return { type: "turn.completed", usage: mapUsage(event.usage) };
    case "turn.failed":
      return {
        type: "turn.failed",
        error: new CodexError("turn_failed", event.error.message),
      };
    case "error":
      return { type: "error", error: new CodexError("turn_failed", event.message) };
    default:
      return null;
  }
}

function mapUsage(usage: unknown): CodexUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  return {
    inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : undefined,
    outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : undefined,
    totalTokens: typeof u.total_tokens === "number" ? u.total_tokens : undefined,
  };
}

class SdkSession implements CodexSession {
  private _threadId: string | null = null;

  constructor(private readonly thread: Thread) {}

  get threadId(): string | null {
    return this._threadId;
  }

  async runTurn<T>({
    prompt,
    schema,
    signal,
  }: CodexStructuredTurnInput<T>): Promise<CodexStructuredTurnResult<T>> {
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
    const turn = await this.thread.run(prompt, { outputSchema: jsonSchema, signal });
    const finalResponse = turn.finalResponse;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(finalResponse);
    } catch (error) {
      throw new CodexError(
        "schema_validation_failed",
        `Codex turn response was not valid JSON: ${(error as Error).message}\nResponse: ${finalResponse.slice(0, 500)}`,
        error,
      );
    }
    const result = schema.safeParse(parsedJson);
    if (!result.success) {
      throw new CodexError(
        "schema_validation_failed",
        `Codex turn response failed schema validation: ${result.error.message}\nResponse: ${finalResponse.slice(0, 500)}`,
      );
    }
    return { parsed: result.data, finalResponse };
  }

  runEvents(prompt: string, options?: CodexTurnOptions): CodexEventStream {
    let resolveResult!: (value: { text: string; usage?: CodexUsage }) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<{ text: string; usage?: CodexUsage }>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const thread = this.thread;
    const setThreadId = (id: string) => {
      this._threadId = id;
    };
    const stream = (async function* (): AsyncGenerator<CodexEvent> {
      let finalText = "";
      let usage: CodexUsage | undefined;
      try {
        const { events } = await thread.runStreamed(prompt, {
          signal: options?.signal,
          ...(options?.outputSchema ? { outputSchema: options.outputSchema } : {}),
        });
        for await (const raw of events) {
          const mapped = mapEvent(raw);
          if (!mapped) continue;

          if (mapped.type === "turn.failed" || mapped.type === "error") {
            throw mapped.error;
          }
          if (mapped.type === "thread.started") {
            setThreadId(mapped.threadId);
          }
          if (mapped.type === "turn.completed") {
            usage = mapped.usage;
          }
          if (
            (mapped.type === "item.started" ||
              mapped.type === "item.updated" ||
              mapped.type === "item.completed") &&
            mapped.item.type === "agent_message"
          ) {
            finalText = mapped.item.text;
          }

          yield mapped;
        }
        resolveResult({ text: finalText, usage });
      } catch (error) {
        rejectResult(error);
        throw error;
      }
    })();

    return Object.assign(stream, { result });
  }

  runPrompt(prompt: string, options?: CodexTurnOptions): CodexTextStream {
    const events = this.runEvents(prompt, options);
    const emittedLengths = new Map<string, number>();

    const stream = (async function* (): AsyncGenerator<string> {
      for await (const event of events) {
        if (
          event.type !== "item.started" &&
          event.type !== "item.updated" &&
          event.type !== "item.completed"
        ) {
          continue;
        }
        if (event.item.type !== "agent_message") continue;

        const text = event.item.text;
        const previousLength = emittedLengths.get(event.item.id) ?? 0;
        emittedLengths.set(event.item.id, text.length);
        if (text.length <= previousLength) continue;

        const delta = text.slice(previousLength);
        if (delta) yield delta;
      }
    })();

    return Object.assign(stream, {
      result: events.result.then((r) => ({ text: r.text })),
    });
  }

  async stop(): Promise<void> {
    // SDK has no explicit stop; AbortSignal handles cancellation per turn.
  }
}

export class CodexSdkBackend implements CodexBackend {
  createSession(config: CodexSessionConfig): CodexSession {
    const env = buildCodexEnvironment(config.codexHome);
    const sdk = new Codex({
      codexPathOverride: config.binaryPath,
      ...(env ? { env } : {}),
    });
    const thread = sdk.startThread({
      model: config.model,
      sandboxMode: config.sandboxMode ?? "read-only",
      workingDirectory: config.cwd,
      skipGitRepoCheck: config.skipGitRepoCheck ?? true,
      modelReasoningEffort: toCodexReasoningEffort(config.reasoningEffort),
      approvalPolicy: config.approvalPolicy ?? "never",
    });
    return new SdkSession(thread);
  }
}

export const codexSdkBackend = new CodexSdkBackend();
