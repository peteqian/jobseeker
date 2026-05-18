import type { z } from "zod";

export type CodexReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type CodexApprovalPolicy = "never" | "on-request" | "on-failure" | "untrusted";

export interface CodexSessionConfig {
  readonly binaryPath: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly cwd?: string;
  readonly codexHome?: string;
  readonly sandboxMode?: CodexSandboxMode;
  readonly approvalPolicy?: CodexApprovalPolicy;
  readonly skipGitRepoCheck?: boolean;
}

export type CodexItem =
  | { type: "agent_message"; id: string; text: string }
  | { type: "reasoning"; id: string; text: string }
  | { type: "command_execution"; id: string; command: string; output?: string; exitCode?: number }
  | {
      type: "file_change";
      id: string;
      changes: { path: string; kind: "add" | "update" | "delete" }[];
      status: "completed" | "failed";
    }
  | { type: "mcp_tool_call"; id: string; server: string; tool: string }
  | { type: "web_search"; id: string; query: string }
  | { type: "todo_list"; id: string; items: { text: string; done: boolean }[] }
  | { type: "error"; id: string; message: string };

export type CodexUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
};

export type CodexEvent =
  | { type: "thread.started"; threadId: string }
  | { type: "turn.started" }
  | { type: "item.started"; item: CodexItem }
  | { type: "item.updated"; item: CodexItem }
  | { type: "item.completed"; item: CodexItem }
  | { type: "turn.completed"; usage?: CodexUsage }
  | { type: "turn.failed"; error: CodexError }
  | { type: "error"; error: CodexError };

export type CodexErrorKind =
  | "spawn_failed"
  | "cli_not_found"
  | "protocol_decode_failed"
  | "turn_failed"
  | "schema_validation_failed"
  | "cancelled"
  | "auth_failed";

export class CodexError extends Error {
  readonly kind: CodexErrorKind;
  readonly detail?: unknown;
  constructor(kind: CodexErrorKind, message: string, detail?: unknown) {
    super(message);
    this.kind = kind;
    this.detail = detail;
    this.name = "CodexError";
  }
}

export interface CodexTurnOptions {
  readonly signal?: AbortSignal;
  readonly outputSchema?: unknown;
}

export interface CodexStructuredTurnInput<T> {
  readonly prompt: string;
  readonly schema: z.ZodType<T>;
  readonly signal?: AbortSignal;
}

export interface CodexStructuredTurnResult<T> {
  readonly parsed: T;
  readonly finalResponse: string;
}

export interface CodexTextStream extends AsyncIterable<string> {
  readonly result: Promise<{ text: string }>;
}

export interface CodexEventStream extends AsyncIterable<CodexEvent> {
  readonly result: Promise<{ text: string; usage?: CodexUsage }>;
}

export interface CodexSession {
  readonly threadId: string | null;
  runTurn<T>(input: CodexStructuredTurnInput<T>): Promise<CodexStructuredTurnResult<T>>;
  runPrompt(prompt: string, options?: CodexTurnOptions): CodexTextStream;
  runEvents(prompt: string, options?: CodexTurnOptions): CodexEventStream;
  stop(): Promise<void>;
}

export interface CodexBackend {
  createSession(config: CodexSessionConfig): CodexSession;
}

export function toCodexReasoningEffort(value: string): CodexReasoningEffort {
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
