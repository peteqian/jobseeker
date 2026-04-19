import type { TopicFileMeta } from "@jobseeker/contracts";

export interface ChatStreamDelta {
  type: "delta";
  chunk: string;
}

export interface ChatStreamTopicUpdate {
  type: "topicUpdate";
  topicId: string;
  slug: string;
  title: string;
  status: "in-progress" | "complete";
  content: string;
}

export interface ChatStreamComplete {
  type: "complete";
  messageId: string;
  content: string;
  topicUpdates: TopicFileMeta[];
}

export type ChatStreamEvent = ChatStreamDelta | ChatStreamTopicUpdate | ChatStreamComplete;

export type ThreadDispatchCommand = ThreadTurnStartCommand | ThreadTurnInterruptCommand;

export interface ThreadCommandMeta {
  commandId: string;
  createdAt: string;
  actor: string;
  sessionId: string;
}

export interface ThreadTurnStartCommand extends ThreadCommandMeta {
  type: "thread.turn.start";
  threadId: string;
  content: string;
  selection?: {
    provider?: string;
    model?: string;
    effort?: string;
  };
}

export interface ThreadTurnInterruptCommand extends ThreadCommandMeta {
  type: "thread.turn.interrupt";
  threadId: string;
}

export interface ProviderRuntimeSessionStarted {
  type: "session.started";
  threadId: string;
  provider: string;
  ts: number;
}

export interface ProviderRuntimeSessionStopped {
  type: "session.stopped";
  threadId: string;
  provider: string;
  reason: "normal" | "interrupted";
  ts: number;
}

export interface ProviderRuntimeTurnStarted {
  type: "turn.started";
  threadId: string;
  turnId: string;
  provider: string;
  ts: number;
}

export interface ProviderRuntimeTurnDelta {
  type: "turn.delta";
  threadId: string;
  turnId: string;
  provider: string;
  chunk: string;
  ts: number;
}

export interface ProviderRuntimeTurnCompleted {
  type: "turn.completed";
  threadId: string;
  turnId: string;
  provider: string;
  textLength: number;
  ts: number;
}

export interface ProviderRuntimeTurnInterrupted {
  type: "turn.interrupted";
  threadId: string;
  turnId: string;
  provider: string;
  ts: number;
}

export interface ProviderRuntimeTurnFailed {
  type: "turn.failed";
  threadId: string;
  turnId: string;
  provider: string;
  error: unknown;
  ts: number;
}

export type ProviderRuntimeEvent =
  | ProviderRuntimeSessionStarted
  | ProviderRuntimeSessionStopped
  | ProviderRuntimeTurnStarted
  | ProviderRuntimeTurnDelta
  | ProviderRuntimeTurnCompleted
  | ProviderRuntimeTurnInterrupted
  | ProviderRuntimeTurnFailed;

export type ThreadStreamEvent = ChatStreamEvent | ProviderRuntimeEvent;

export interface ThreadStreamEnvelope {
  threadId: string;
  sequence: number;
  createdAt: string;
  event: ThreadStreamEvent;
}

export interface ThreadProjectionSnapshot {
  threadId: string;
  latestSequence: number;
  isStreaming: boolean;
  activeTurnId: string | null;
  assistantDraft: string;
  lastEventType: string | null;
  lastError: string | null;
  updatedAt: string;
}
