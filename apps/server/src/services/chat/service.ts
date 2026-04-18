import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type {
  ChatMessage,
  ChatModelSelection,
  ProviderId,
  ProviderModel,
  TopicFile,
  TopicFileMeta,
} from "@jobseeker/contracts";

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

export interface ChatProviderInfo {
  id: ProviderId;
  available: boolean;
  models: ProviderModel[];
}

export interface ChatServiceShape {
  listProviders: () => Effect.Effect<ChatProviderInfo[]>;
  getMessages: (projectId: string) => Effect.Effect<ChatMessage[]>;
  sendMessage: (
    projectId: string,
    content: string,
    selection?: ChatModelSelection,
  ) => Stream.Stream<ChatStreamEvent, Error>;
  dismissInsight: (projectId: string, cardId: string) => Effect.Effect<void>;
  listTopics: (projectId: string) => Effect.Effect<TopicFileMeta[]>;
  getTopic: (projectId: string, topicId: string) => Effect.Effect<TopicFile>;
  updateTopic: (projectId: string, topicId: string, content: string) => Effect.Effect<TopicFile>;
}

export class ChatService extends Context.Service<ChatService, ChatServiceShape>()(
  "jobseeker/ChatService",
) {}
