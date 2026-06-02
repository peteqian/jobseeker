import type { ChatModelSelection, ProviderId, ProviderModel } from "@jobseeker/contracts";

export interface ProviderRuntimeOptions {
  cwd?: string;
  codexHome?: string;
  /**
   * When set, resume the provider's native session instead of starting fresh.
   * The provider sends only the newest message and relies on its own
   * server-side memory. Absent = cold start (full history replay).
   */
  resume?: { sessionId: string };
}

/** Result of a provider turn. `sessionId` is the provider's native session id
 * to persist for resuming the next turn (undefined if the provider has none). */
export interface ProviderTurnResult {
  text: string;
  sessionId?: string;
}

/**
 * A streamed turn surface richer than plain text deltas: lets callers observe
 * reasoning, tool/command runs, and the answer as they happen. Providers that
 * can't separate these (opencode, claude) emit only `message`.
 */
export type ProviderStreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "message"; text: string }
  | { type: "tool"; label: string };

export interface ChatProvider {
  id: ProviderId;
  models(): Promise<ProviderModel[]>;
  available(): boolean;
  run(
    prompt: string,
    history: { role: string; content: string }[],
    selection?: ChatModelSelection,
    runtime?: ProviderRuntimeOptions,
    signal?: AbortSignal,
  ): AsyncIterable<string> & {
    result: Promise<ProviderTurnResult>;
  };
  /**
   * Optional event-level stream (reasoning + tool runs + message deltas).
   * Present on codex; absent providers fall back to `run`'s text deltas.
   */
  runEvents?(
    prompt: string,
    history: { role: string; content: string }[],
    selection?: ChatModelSelection,
    runtime?: ProviderRuntimeOptions,
    signal?: AbortSignal,
  ): AsyncIterable<ProviderStreamEvent> & {
    result: Promise<ProviderTurnResult>;
  };
}
