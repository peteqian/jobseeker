import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type {
  ChatMessage,
  ChatScope,
  ChatThread,
  ChatModelSelection,
  ProviderId,
  ProviderModel,
  TopicFile,
  TopicFileMeta,
} from "@jobseeker/contracts";
import type { ProviderServiceEvent } from "../../provider/services/providerService";

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

export type ChatDispatchCommand =
  | {
      type: "thread.turn.start";
      threadId: string;
      content: string;
      selection?: ChatModelSelection;
    }
  | {
      type: "thread.turn.interrupt";
      threadId: string;
    };

export type ThreadStreamEvent = ChatStreamEvent | ProviderServiceEvent;

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

export interface ChatProviderInfo {
  id: ProviderId;
  available: boolean;
  models: ProviderModel[];
}

export interface ChatServiceShape {
  listProviders: () => Effect.Effect<ChatProviderInfo[]>;
  listThreads: (projectId: string, scope: ChatScope) => Effect.Effect<ChatThread[]>;
  createThread: (projectId: string, scope: ChatScope, title?: string) => Effect.Effect<ChatThread>;
  getMessages: (threadId: string) => Effect.Effect<ChatMessage[]>;
  sendMessage: (
    threadId: string,
    content: string,
    selection?: ChatModelSelection,
  ) => Stream.Stream<ChatStreamEvent, Error>;
  dispatchCommand: (command: ChatDispatchCommand) => Effect.Effect<{ accepted: boolean }>;
  subscribeThread: (
    threadId: string,
    afterSequence?: number,
  ) => Stream.Stream<ThreadStreamEnvelope, Error>;
  getThreadProjection: (threadId: string) => Effect.Effect<ThreadProjectionSnapshot>;
  dismissInsight: (projectId: string, cardId: string) => Effect.Effect<void>;
  listTopics: (projectId: string) => Effect.Effect<TopicFileMeta[]>;
  getTopic: (projectId: string, topicId: string) => Effect.Effect<TopicFile>;
  updateTopic: (projectId: string, topicId: string, content: string) => Effect.Effect<TopicFile>;
  interruptThread: (threadId: string) => Effect.Effect<boolean>;
  streamRuntime: (threadId?: string) => Stream.Stream<ProviderServiceEvent, Error>;
}

export class ChatService extends Context.Service<ChatService, ChatServiceShape>()(
  "jobseeker/ChatService",
) {}
