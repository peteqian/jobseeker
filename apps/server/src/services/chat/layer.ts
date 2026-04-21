import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { and, asc, eq } from "drizzle-orm";
import type {
  ChatModelSelection,
  ChatScope,
  ChatThread,
  TopicFile,
  TopicFileMeta,
} from "@jobseeker/contracts";

import { ProviderServiceLive } from "../../provider/layers/providerService";
import { ProviderService } from "../../provider/services/providerService";
import { db } from "../../db";
import { chatThreads, insightCards, projects, topicFiles } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { readTopicFile, topicPath, writeTopicFile } from "../topics";
import {
  ChatService,
  type ChatDispatchCommand,
  type ChatProviderInfo,
  type ThreadProjectionSnapshot,
  type ThreadStreamEnvelope,
} from "./service";
import {
  appendThreadEvent,
  getThreadProjection,
  listThreadEvents,
  tryRecordThreadCommand,
} from "./projectionStore";
import {
  ensureDefaultThread,
  getThread,
  getThreadMessages,
  toTopicMeta,
  toThread,
} from "./repository";
import { writeThreadRuntimeEvent } from "./runtimeEvents";
import { buildSendMessageStream } from "./sendMessage";
import { publishThreadEvent, subscribeThreadEvents } from "./subscriptions";

function now(): string {
  return new Date().toISOString();
}

export const ChatServiceLive = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const providerService = yield* ProviderService;

    yield* Effect.sync(() => {
      Effect.runFork(
        Stream.runForEach(
          Stream.fromAsyncIterable(providerService.streamEvents(), (err) =>
            err instanceof Error ? err : new Error(String(err)),
          ),
          (event) =>
            Effect.promise(async () => {
              const thread = await getThread(event.threadId).catch(() => null);
              if (!thread) {
                return;
              }

              const envelope = await appendThreadEvent(event.threadId, event);
              publishThreadEvent(event.threadId, envelope);
              await writeThreadRuntimeEvent(thread.projectId, "thread.runtime.event", {
                threadId: event.threadId,
                sequence: envelope.sequence,
                event,
              });
            }),
        ),
      );
    });

    return {
      listProviders: () =>
        Effect.promise(async (): Promise<ChatProviderInfo[]> => {
          const providersFromRegistry = providerService.listProviders();
          const providers = await Promise.all(
            providersFromRegistry.map(async (provider) => ({
              id: provider.provider,
              available: provider.available(),
              models: await provider.models().catch(() => []),
            })),
          );

          return providers;
        }),

      listThreads: (projectId: string, scope: ChatScope) =>
        Effect.promise(async (): Promise<ChatThread[]> => {
          await ensureDefaultThread(projectId, scope);
          const rows = await db
            .select()
            .from(chatThreads)
            .where(and(eq(chatThreads.projectId, projectId), eq(chatThreads.scope, scope)))
            .orderBy(asc(chatThreads.createdAt))
            .all();
          return rows.map(toThread);
        }),

      createThread: (projectId: string, scope: ChatScope, title?: string) =>
        Effect.promise(async (): Promise<ChatThread> => {
          const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
          if (!project) {
            throw new Error("Project not found");
          }

          const ts = now();
          const id = makeId("thread");
          const row: ChatThread = {
            id,
            projectId,
            scope,
            title:
              title?.trim() || `${scope === "coach" ? "Coach" : "Explorer"} ${ts.slice(11, 16)}`,
            status: "active",
            createdAt: ts,
            updatedAt: ts,
          };
          await db.insert(chatThreads).values(row);
          return row;
        }),

      getMessages: (threadId: string) => Effect.promise(() => getThreadMessages(threadId)),

      sendMessage: (threadId: string, content: string, selection?: ChatModelSelection) =>
        buildSendMessageStream(providerService, threadId, content, selection),

      dispatchCommand: (command: ChatDispatchCommand) =>
        Effect.promise(async () => {
          const isNewCommand = await tryRecordThreadCommand(command);
          if (!isNewCommand) {
            return { accepted: true };
          }

          if (command.type === "thread.turn.interrupt") {
            const thread = await getThread(command.threadId);
            await writeThreadRuntimeEvent(thread.projectId, "thread.command.dispatched", {
              commandId: command.commandId,
              createdAt: command.createdAt,
              actor: command.actor,
              sessionId: command.sessionId,
              threadId: command.threadId,
              command: "thread.turn.interrupt",
            });
            providerService.interruptSession(command.threadId);
            return { accepted: true };
          }

          const thread = await getThread(command.threadId);
          await writeThreadRuntimeEvent(thread.projectId, "thread.command.dispatched", {
            commandId: command.commandId,
            createdAt: command.createdAt,
            actor: command.actor,
            sessionId: command.sessionId,
            threadId: command.threadId,
            command: "thread.turn.start",
            contentLength: command.content.length,
            selection: command.selection ?? null,
          });
          Effect.runFork(
            Stream.runDrain(
              buildSendMessageStream(
                providerService,
                command.threadId,
                command.content,
                command.selection,
              ),
            ),
          );
          return { accepted: true };
        }),

      subscribeThread: (threadId: string, afterSequence = 0) =>
        Stream.merge(
          Stream.unwrap(
            Effect.promise(async () => {
              const recorded = await listThreadEvents(threadId, afterSequence);
              return Stream.fromIterable(recorded);
            }),
          ),
          Stream.fromAsyncIterable(subscribeThreadEvents(threadId), (err) =>
            err instanceof Error ? err : new Error(String(err)),
          ),
        ) as Stream.Stream<ThreadStreamEnvelope, Error>,

      getThreadProjection: (threadId: string) =>
        Effect.promise(async (): Promise<ThreadProjectionSnapshot> => {
          return getThreadProjection(threadId);
        }),

      interruptThread: (threadId: string) =>
        Effect.sync(() => {
          return providerService.interruptSession(threadId);
        }),

      streamRuntime: (threadId?: string) =>
        Stream.fromAsyncIterable(providerService.streamEvents(threadId), (err) =>
          err instanceof Error ? err : new Error(String(err)),
        ),

      dismissInsight: (_projectId: string, cardId: string) =>
        Effect.promise(async () => {
          await db
            .update(insightCards)
            .set({ status: "dismissed", updatedAt: now() })
            .where(eq(insightCards.id, cardId));
        }),

      listTopics: (projectId: string) =>
        Effect.promise(async (): Promise<TopicFileMeta[]> => {
          const rows = await db
            .select()
            .from(topicFiles)
            .where(eq(topicFiles.projectId, projectId))
            .all();

          return rows.map(toTopicMeta);
        }),

      getTopic: (projectId: string, topicId: string) =>
        Effect.promise(async (): Promise<TopicFile> => {
          const row = await db
            .select()
            .from(topicFiles)
            .where(and(eq(topicFiles.id, topicId), eq(topicFiles.projectId, projectId)))
            .get();

          if (!row) throw new Error(`Topic ${topicId} not found`);

          const content = await readTopicFile(row.filePath);

          return {
            ...toTopicMeta(row),
            content,
          };
        }),

      updateTopic: (projectId: string, topicId: string, content: string) =>
        Effect.promise(async (): Promise<TopicFile> => {
          const row = await db.select().from(topicFiles).where(eq(topicFiles.id, topicId)).get();

          if (!row) throw new Error(`Topic ${topicId} not found`);

          const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
          if (!project) throw new Error(`Project ${projectId} not found`);

          const ts = now();
          await writeTopicFile(project.slug ?? project.id, row.slug, content);
          await db
            .update(topicFiles)
            .set({
              filePath: topicPath(project.slug ?? project.id, row.slug),
              updatedAt: ts,
            })
            .where(eq(topicFiles.id, topicId));

          return {
            ...toTopicMeta({ ...row, updatedAt: ts }),
            content,
          };
        }),
    };
  }),
).pipe(Layer.provide(ProviderServiceLive));
