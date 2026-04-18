import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { RpcClient } from "effect/unstable/rpc";
import { RpcSerialization } from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";

import {
  ChatRpcGroup,
  type ChatMessage,
  type ProviderModel,
  type ProviderId,
  type TopicFile,
  type TopicFileMeta,
} from "@jobseeker/contracts";

import type { ChatStreamEvent } from "./types";

export type ChatProviderResponse = {
  id: ProviderId | string;
  available: boolean;
  models: ProviderModel[];
};

const WS_URL = (import.meta as any).env?.VITE_WS_URL ?? "ws://127.0.0.1:3458/ws";

const ProtocolLayer = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(Socket.layerWebSocket(WS_URL)),
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provide(RpcSerialization.layerJson),
);

const runtime = ManagedRuntime.make(ProtocolLayer);

function run<A>(effect: Effect.Effect<A, any, any>): Promise<A> {
  return runtime.runPromise(effect as Effect.Effect<A, never, never>);
}

export async function listProviders() {
  return run(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(ChatRpcGroup);
      return yield* client["chat.listProviders"]();
    }).pipe(Effect.scoped),
  ) as Promise<ChatProviderResponse[]>;
}

export async function getMessages(projectId: string): Promise<ChatMessage[]> {
  return run(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(ChatRpcGroup);
      return yield* client["chat.getMessages"]({ projectId });
    }).pipe(Effect.scoped),
  ) as Promise<ChatMessage[]>;
}

export async function dismissInsight(projectId: string, cardId: string): Promise<void> {
  return run(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(ChatRpcGroup);
      yield* client["chat.dismissInsight"]({ projectId, cardId });
    }).pipe(Effect.scoped),
  );
}

export async function listTopics(projectId: string): Promise<TopicFileMeta[]> {
  return run(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(ChatRpcGroup);
      return yield* client["chat.listTopics"]({ projectId });
    }).pipe(Effect.scoped),
  ) as Promise<TopicFileMeta[]>;
}

export async function getTopic(projectId: string, topicId: string): Promise<TopicFile> {
  return run(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(ChatRpcGroup);
      return yield* client["chat.getTopic"]({ projectId, topicId });
    }).pipe(Effect.scoped),
  ) as Promise<TopicFile>;
}

export async function updateTopic(
  projectId: string,
  topicId: string,
  content: string,
): Promise<TopicFile> {
  return run(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(ChatRpcGroup);
      return yield* client["chat.updateTopic"]({ projectId, topicId, content });
    }).pipe(Effect.scoped),
  ) as Promise<TopicFile>;
}

export function sendMessage(
  projectId: string,
  content: string,
  selection?: {
    provider?: string;
    model?: string;
    effort?: string;
  },
  onEvent?: (event: ChatStreamEvent) => void,
): Promise<void> {
  return run(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(ChatRpcGroup);
      const stream = client["chat.sendMessage"]({
        projectId,
        content,
        ...(selection?.provider ? { provider: selection.provider } : {}),
        ...(selection?.model ? { model: selection.model } : {}),
        ...(selection?.effort ? { effort: selection.effort } : {}),
      });
      yield* Stream.runForEach(stream, (event) =>
        Effect.sync(() => onEvent?.(event as ChatStreamEvent)),
      );
    }).pipe(Effect.scoped),
  );
}
