import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as RpcServer from "effect/unstable/rpc/RpcServer";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";

import { ChatRpcGroup, ChatError, type ProviderId } from "@jobseeker/contracts";
import { logError, logInfo } from "./lib/log";
import { ChatService } from "./services/chat/service";
import { ChatServiceLive } from "./services/chat/layer";

function parseProviderId(provider?: string): ProviderId | undefined {
  return provider === "codex" || provider === "claude" || provider === "opencode"
    ? provider
    : undefined;
}

type RpcDispatchCommand =
  | {
      type: "thread.turn.start";
      threadId: string;
      content: string;
      selection?: {
        provider?: string;
        model?: string;
        effort?: string;
      };
    }
  | {
      type: "thread.turn.interrupt";
      threadId: string;
    };

// ---------------------------------------------------------------------------
// RPC handlers — bridge ChatRpcGroup methods to ChatService
// ---------------------------------------------------------------------------

const ChatHandlers = ChatRpcGroup.toLayer(
  Effect.gen(function* () {
    const chat = yield* ChatService;

    return {
      "chat.listProviders": () => chat.listProviders(),

      "chat.listThreads": ({
        projectId,
        scope,
      }: {
        projectId: string;
        scope: "coach" | "explorer";
      }) => chat.listThreads(projectId, scope),

      "chat.createThread": ({
        projectId,
        scope,
        title,
      }: {
        projectId: string;
        scope: "coach" | "explorer";
        title?: string;
      }) => chat.createThread(projectId, scope, title),

      "chat.getMessages": ({ threadId }: { threadId: string }) => chat.getMessages(threadId),

      "chat.sendMessage": ({
        threadId,
        content,
        provider,
        model,
        effort,
      }: {
        threadId: string;
        content: string;
        provider?: string;
        model?: string;
        effort?: string;
      }) =>
        chat
          .sendMessage(threadId, content, { provider: parseProviderId(provider), model, effort })
          .pipe(Stream.mapError((err) => new ChatError({ message: err.message }))),

      "chat.dispatchCommand": ({ command }: { command: RpcDispatchCommand }) => {
        if (command?.type === "thread.turn.start") {
          const provider = parseProviderId(command.selection?.provider);
          if (command.selection?.provider && !provider) {
            return Effect.fail(new ChatError({ message: "Unsupported provider" }));
          }

          return chat.dispatchCommand({
            type: "thread.turn.start",
            threadId: command.threadId,
            content: command.content,
            selection: command.selection
              ? {
                  ...(provider ? { provider } : {}),
                  model: command.selection.model,
                  effort: command.selection.effort,
                }
              : undefined,
          });
        }

        if (command?.type === "thread.turn.interrupt") {
          return chat.dispatchCommand({
            type: "thread.turn.interrupt",
            threadId: command.threadId,
          });
        }

        return Effect.fail(new ChatError({ message: "Unsupported command" }));
      },

      "chat.subscribeThread": ({
        threadId,
        afterSequence,
      }: {
        threadId: string;
        afterSequence?: number;
      }) =>
        chat
          .subscribeThread(threadId, afterSequence)
          .pipe(Stream.mapError((err) => new ChatError({ message: err.message }))),

      "chat.getThreadProjection": ({ threadId }: { threadId: string }) =>
        chat.getThreadProjection(threadId),

      "chat.interruptThread": ({ threadId }: { threadId: string }) =>
        chat.interruptThread(threadId),

      "chat.streamRuntime": ({ threadId }: { threadId?: string }) =>
        chat
          .streamRuntime(threadId)
          .pipe(Stream.mapError((err) => new ChatError({ message: err.message }))),

      "chat.dismissInsight": ({ projectId, cardId }: { projectId: string; cardId: string }) =>
        chat.dismissInsight(projectId, cardId),

      "chat.listTopics": ({ projectId }: { projectId: string }) => chat.listTopics(projectId),

      "chat.getTopic": ({ projectId, topicId }: { projectId: string; topicId: string }) =>
        chat.getTopic(projectId, topicId),

      "chat.updateTopic": ({
        projectId,
        topicId,
        content,
      }: {
        projectId: string;
        topicId: string;
        content: string;
      }) => chat.updateTopic(projectId, topicId, content),
    };
  }),
);

// ---------------------------------------------------------------------------
// Assemble the RPC server layers
// ---------------------------------------------------------------------------

const WS_PORT = Number(process.env.PORT ?? "3456") + 2; // 3458 (3457 is the web dev server)

// WebSocket protocol on /ws, with JSON serialization
const WsProtocol = RpcServer.layerProtocolWebsocket({ path: "/ws" }).pipe(
  Layer.provide(RpcSerialization.layerJson),
);

// RpcServer.layer dispatches incoming RPC messages to handlers
// Requires: Protocol (from WsProtocol) + ToHandler (from ChatHandlers)
const RpcLayer = RpcServer.layer(ChatRpcGroup).pipe(
  Layer.provide(ChatHandlers),
  Layer.provide(WsProtocol),
);

// HttpRouter.serve creates the HTTP server loop with a router
// RpcLayer + WsProtocol register routes on the HttpRouter internally
const ServerLayer = HttpRouter.serve(RpcLayer).pipe(
  Layer.provide(BunHttpServer.layer({ port: WS_PORT })),
  Layer.provide(BunHttpServer.layerHttpServices),
  Layer.provide(ChatServiceLive),
);

// ---------------------------------------------------------------------------
// Public launcher — call from bin.ts
// ---------------------------------------------------------------------------

export function startWsServer(): Promise<void> {
  const program = Layer.launch(ServerLayer).pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        logInfo("ws server listening", { url: `ws://127.0.0.1:${WS_PORT}/ws` });
      }),
    ),
  );

  return Effect.runPromise(program).catch((error) => {
    logError("ws server failed to start", { error });
    throw error;
  });
}
