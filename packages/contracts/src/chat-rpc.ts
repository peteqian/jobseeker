import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

export const ChatMessageSchema = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  role: Schema.Literals(["user", "assistant", "system"]),
  content: Schema.String,
  createdAt: Schema.String,
});

export const InsightCardSchema = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  chatMessageId: Schema.NullOr(Schema.String),
  title: Schema.String,
  body: Schema.String,
  category: Schema.Literals(["positioning", "evidence", "reframing", "gap", "other"]),
  status: Schema.Literals(["active", "dismissed"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const ModelCapabilitiesSchema = Schema.Struct({
  reasoningEffort: Schema.Array(Schema.String),
  defaultEffort: Schema.String,
});

export const ProviderModelSchema = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  capabilities: ModelCapabilitiesSchema,
});

export const ChatProviderSchema = Schema.Struct({
  id: Schema.String,
  available: Schema.Boolean,
  models: Schema.Array(ProviderModelSchema),
});

export class ChatError extends Schema.TaggedErrorClass<ChatError>()("ChatError", {
  message: Schema.String,
}) {}

export const ChatDeltaSchema = Schema.Struct({
  type: Schema.Literal("delta"),
  chunk: Schema.String,
});

export const TopicFileMetaSchema = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  status: Schema.Literals(["in-progress", "complete"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const TopicFileSchema = Schema.Struct({
  ...TopicFileMetaSchema.fields,
  content: Schema.String,
});

export const ChatTopicUpdateSchema = Schema.Struct({
  type: Schema.Literal("topicUpdate"),
  topicId: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  status: Schema.Literals(["in-progress", "complete"]),
  content: Schema.String,
});

export const ChatCompleteSchema = Schema.Struct({
  type: Schema.Literal("complete"),
  messageId: Schema.String,
  content: Schema.String,
  topicUpdates: Schema.Array(TopicFileMetaSchema),
});

export const ChatStreamEventSchema = Schema.Union([
  ChatDeltaSchema,
  ChatTopicUpdateSchema,
  ChatCompleteSchema,
]);

export const CHAT_WS_METHODS = {
  listProviders: "chat.listProviders",
  sendMessage: "chat.sendMessage",
  getMessages: "chat.getMessages",
  dismissInsight: "chat.dismissInsight",
  listTopics: "chat.listTopics",
  getTopic: "chat.getTopic",
  updateTopic: "chat.updateTopic",
} as const;

export const ListProvidersRpc = Rpc.make(CHAT_WS_METHODS.listProviders, {
  success: Schema.Array(ChatProviderSchema),
  error: ChatError,
});

export const SendMessageRpc = Rpc.make(CHAT_WS_METHODS.sendMessage, {
  payload: Schema.Struct({
    projectId: Schema.String,
    content: Schema.String,
    provider: Schema.optionalKey(Schema.String),
    model: Schema.optionalKey(Schema.String),
    effort: Schema.optionalKey(Schema.String),
  }),
  success: ChatStreamEventSchema,
  error: ChatError,
  stream: true,
});

export const GetMessagesRpc = Rpc.make(CHAT_WS_METHODS.getMessages, {
  payload: Schema.Struct({ projectId: Schema.String }),
  success: Schema.Array(ChatMessageSchema),
  error: ChatError,
});

export const DismissInsightRpc = Rpc.make(CHAT_WS_METHODS.dismissInsight, {
  payload: Schema.Struct({ projectId: Schema.String, cardId: Schema.String }),
  error: ChatError,
});

export const ListTopicsRpc = Rpc.make(CHAT_WS_METHODS.listTopics, {
  payload: Schema.Struct({ projectId: Schema.String }),
  success: Schema.Array(TopicFileMetaSchema),
  error: ChatError,
});

export const GetTopicRpc = Rpc.make(CHAT_WS_METHODS.getTopic, {
  payload: Schema.Struct({ projectId: Schema.String, topicId: Schema.String }),
  success: TopicFileSchema,
  error: ChatError,
});

export const UpdateTopicRpc = Rpc.make(CHAT_WS_METHODS.updateTopic, {
  payload: Schema.Struct({
    projectId: Schema.String,
    topicId: Schema.String,
    content: Schema.String,
  }),
  success: TopicFileSchema,
  error: ChatError,
});

export const ChatRpcGroup = RpcGroup.make(
  ListProvidersRpc,
  SendMessageRpc,
  GetMessagesRpc,
  DismissInsightRpc,
  ListTopicsRpc,
  GetTopicRpc,
  UpdateTopicRpc,
);
