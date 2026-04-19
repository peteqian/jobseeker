import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

export const ChatMessageSchema = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  threadId: Schema.String,
  role: Schema.Literals(["user", "assistant", "system"]),
  content: Schema.String,
  createdAt: Schema.String,
});

export const ChatThreadSchema = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  scope: Schema.Literals(["coach", "explorer"]),
  title: Schema.String,
  status: Schema.Literals(["active", "archived"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
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

export const ProviderRuntimeSessionStartedSchema = Schema.Struct({
  type: Schema.Literal("session.started"),
  threadId: Schema.String,
  provider: Schema.String,
  ts: Schema.Number,
});

export const ProviderRuntimeSessionStoppedSchema = Schema.Struct({
  type: Schema.Literal("session.stopped"),
  threadId: Schema.String,
  provider: Schema.String,
  reason: Schema.Literals(["normal", "interrupted"]),
  ts: Schema.Number,
});

export const ProviderRuntimeTurnStartedSchema = Schema.Struct({
  type: Schema.Literal("turn.started"),
  threadId: Schema.String,
  turnId: Schema.String,
  provider: Schema.String,
  ts: Schema.Number,
});

export const ProviderRuntimeTurnDeltaSchema = Schema.Struct({
  type: Schema.Literal("turn.delta"),
  threadId: Schema.String,
  turnId: Schema.String,
  provider: Schema.String,
  chunk: Schema.String,
  ts: Schema.Number,
});

export const ProviderRuntimeTurnCompletedSchema = Schema.Struct({
  type: Schema.Literal("turn.completed"),
  threadId: Schema.String,
  turnId: Schema.String,
  provider: Schema.String,
  textLength: Schema.Number,
  ts: Schema.Number,
});

export const ProviderRuntimeTurnInterruptedSchema = Schema.Struct({
  type: Schema.Literal("turn.interrupted"),
  threadId: Schema.String,
  turnId: Schema.String,
  provider: Schema.String,
  ts: Schema.Number,
});

export const ProviderRuntimeTurnFailedSchema = Schema.Struct({
  type: Schema.Literal("turn.failed"),
  threadId: Schema.String,
  turnId: Schema.String,
  provider: Schema.String,
  error: Schema.Unknown,
  ts: Schema.Number,
});

export const ProviderRuntimeEventSchema = Schema.Union([
  ProviderRuntimeSessionStartedSchema,
  ProviderRuntimeSessionStoppedSchema,
  ProviderRuntimeTurnStartedSchema,
  ProviderRuntimeTurnDeltaSchema,
  ProviderRuntimeTurnCompletedSchema,
  ProviderRuntimeTurnInterruptedSchema,
  ProviderRuntimeTurnFailedSchema,
]);

export const ChatModelSelectionSchema = Schema.Struct({
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(Schema.String),
});

export const ThreadTurnStartCommandSchema = Schema.Struct({
  type: Schema.Literal("thread.turn.start"),
  threadId: Schema.String,
  content: Schema.String,
  selection: Schema.optionalKey(ChatModelSelectionSchema),
});

export const ThreadTurnInterruptCommandSchema = Schema.Struct({
  type: Schema.Literal("thread.turn.interrupt"),
  threadId: Schema.String,
});

export const ChatDispatchCommandSchema = Schema.Union([
  ThreadTurnStartCommandSchema,
  ThreadTurnInterruptCommandSchema,
]);

export const ChatStreamEventSchema = Schema.Union([
  ChatDeltaSchema,
  ChatTopicUpdateSchema,
  ChatCompleteSchema,
]);

export const ThreadStreamEventSchema = Schema.Union([
  ChatDeltaSchema,
  ChatTopicUpdateSchema,
  ChatCompleteSchema,
  ProviderRuntimeSessionStartedSchema,
  ProviderRuntimeSessionStoppedSchema,
  ProviderRuntimeTurnStartedSchema,
  ProviderRuntimeTurnDeltaSchema,
  ProviderRuntimeTurnCompletedSchema,
  ProviderRuntimeTurnInterruptedSchema,
  ProviderRuntimeTurnFailedSchema,
]);

export const ThreadStreamEnvelopeSchema = Schema.Struct({
  threadId: Schema.String,
  sequence: Schema.Number,
  createdAt: Schema.String,
  event: ThreadStreamEventSchema,
});

export const ThreadProjectionSchema = Schema.Struct({
  threadId: Schema.String,
  latestSequence: Schema.Number,
  isStreaming: Schema.Boolean,
  activeTurnId: Schema.NullOr(Schema.String),
  assistantDraft: Schema.String,
  lastEventType: Schema.NullOr(Schema.String),
  lastError: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
});

export const CHAT_WS_METHODS = {
  listProviders: "chat.listProviders",
  listThreads: "chat.listThreads",
  createThread: "chat.createThread",
  sendMessage: "chat.sendMessage",
  getMessages: "chat.getMessages",
  dismissInsight: "chat.dismissInsight",
  listTopics: "chat.listTopics",
  getTopic: "chat.getTopic",
  updateTopic: "chat.updateTopic",
  dispatchCommand: "chat.dispatchCommand",
  subscribeThread: "chat.subscribeThread",
  getThreadProjection: "chat.getThreadProjection",
  interruptThread: "chat.interruptThread",
  streamRuntime: "chat.streamRuntime",
} as const;

export const ListProvidersRpc = Rpc.make(CHAT_WS_METHODS.listProviders, {
  success: Schema.Array(ChatProviderSchema),
  error: ChatError,
});

export const SendMessageRpc = Rpc.make(CHAT_WS_METHODS.sendMessage, {
  payload: Schema.Struct({
    threadId: Schema.String,
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
  payload: Schema.Struct({ threadId: Schema.String }),
  success: Schema.Array(ChatMessageSchema),
  error: ChatError,
});

export const ListThreadsRpc = Rpc.make(CHAT_WS_METHODS.listThreads, {
  payload: Schema.Struct({
    projectId: Schema.String,
    scope: Schema.Literals(["coach", "explorer"]),
  }),
  success: Schema.Array(ChatThreadSchema),
  error: ChatError,
});

export const CreateThreadRpc = Rpc.make(CHAT_WS_METHODS.createThread, {
  payload: Schema.Struct({
    projectId: Schema.String,
    scope: Schema.Literals(["coach", "explorer"]),
    title: Schema.optionalKey(Schema.String),
  }),
  success: ChatThreadSchema,
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

export const InterruptThreadRpc = Rpc.make(CHAT_WS_METHODS.interruptThread, {
  payload: Schema.Struct({ threadId: Schema.String }),
  success: Schema.Boolean,
  error: ChatError,
});

export const StreamRuntimeRpc = Rpc.make(CHAT_WS_METHODS.streamRuntime, {
  payload: Schema.Struct({
    threadId: Schema.optionalKey(Schema.String),
  }),
  success: ProviderRuntimeEventSchema,
  error: ChatError,
  stream: true,
});

export const DispatchCommandRpc = Rpc.make(CHAT_WS_METHODS.dispatchCommand, {
  payload: Schema.Struct({
    command: ChatDispatchCommandSchema,
  }),
  success: Schema.Struct({ accepted: Schema.Boolean }),
  error: ChatError,
});

export const SubscribeThreadRpc = Rpc.make(CHAT_WS_METHODS.subscribeThread, {
  payload: Schema.Struct({
    threadId: Schema.String,
    afterSequence: Schema.optionalKey(Schema.Number),
  }),
  success: ThreadStreamEnvelopeSchema,
  error: ChatError,
  stream: true,
});

export const GetThreadProjectionRpc = Rpc.make(CHAT_WS_METHODS.getThreadProjection, {
  payload: Schema.Struct({ threadId: Schema.String }),
  success: ThreadProjectionSchema,
  error: ChatError,
});

export const ChatRpcGroup = RpcGroup.make(
  ListProvidersRpc,
  ListThreadsRpc,
  CreateThreadRpc,
  SendMessageRpc,
  GetMessagesRpc,
  DismissInsightRpc,
  ListTopicsRpc,
  GetTopicRpc,
  UpdateTopicRpc,
  DispatchCommandRpc,
  SubscribeThreadRpc,
  GetThreadProjectionRpc,
  InterruptThreadRpc,
  StreamRuntimeRpc,
);
