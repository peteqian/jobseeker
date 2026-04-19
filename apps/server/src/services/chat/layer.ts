import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { and, asc, eq } from "drizzle-orm";
import type {
  ChatModelSelection,
  ChatMessage,
  ChatScope,
  ChatThread,
  ProviderId,
  RuntimeEventType,
  TopicFile,
  TopicFileMeta,
  StructuredProfile,
} from "@jobseeker/contracts";
import { ProviderServiceLive } from "../../provider/layers/providerService";
import { ProviderService } from "../../provider/services/providerService";
import { resolveProviderModel, resolveReasoningEffort } from "../../provider/utils";

import { makeId } from "../../lib/ids";
import { buildSystemPrompt, parseTopicUpdates, stripTopicMarkers } from "../../prompts/chat";
import { logError, logInfo, logWarn } from "../../lib/log";
import { ensureCodexHomeDir, ensureScopeDir } from "../../lib/paths";
import { readTopicFile, topicPath, writeTopicFile } from "../topics";
import { db } from "../../db";
import {
  chatThreads,
  chatMessages,
  documents,
  insightCards,
  providerSessionRuntime,
  profiles,
  projects,
  topicFiles,
  events,
} from "../../db/schema";

import {
  ChatService,
  type ChatDispatchCommand,
  type ChatProviderInfo,
  type ChatStreamEvent,
  type ThreadProjectionSnapshot,
  type ThreadStreamEnvelope,
  type ThreadStreamEvent,
} from "./service";
import {
  appendThreadEvent,
  getThreadProjection,
  listThreadEvents,
  recordThreadCommand,
} from "./projectionStore";

const now = () => new Date().toISOString();

interface ThreadEventSubscriber {
  readonly id: number;
  readonly threadId: string;
  closed: boolean;
  pending: ThreadStreamEnvelope[];
  resolveNext: ((event: ThreadStreamEnvelope | null) => void) | null;
}

const threadEventSubscribers = new Map<number, ThreadEventSubscriber>();
let nextThreadEventSubscriberId = 0;

function publishThreadEvent(threadId: string, event: ThreadStreamEnvelope): void {
  for (const subscriber of threadEventSubscribers.values()) {
    if (subscriber.closed || subscriber.threadId !== threadId) {
      continue;
    }

    if (subscriber.resolveNext) {
      const resolve = subscriber.resolveNext;
      subscriber.resolveNext = null;
      resolve(event);
      continue;
    }

    subscriber.pending.push(event);
  }
}

async function nextThreadEvent(
  subscriber: ThreadEventSubscriber,
): Promise<ThreadStreamEnvelope | null> {
  if (subscriber.pending.length > 0) {
    return subscriber.pending.shift() ?? null;
  }
  if (subscriber.closed) {
    return null;
  }

  return new Promise((resolve) => {
    subscriber.resolveNext = resolve;
  });
}

function stopThreadEventSubscription(subscriber: ThreadEventSubscriber): void {
  if (subscriber.closed) {
    return;
  }

  subscriber.closed = true;
  threadEventSubscribers.delete(subscriber.id);
  if (subscriber.resolveNext) {
    const resolve = subscriber.resolveNext;
    subscriber.resolveNext = null;
    resolve(null);
  }
}

function subscribeThreadEvents(threadId: string): AsyncIterable<ThreadStreamEnvelope> {
  const subscriber: ThreadEventSubscriber = {
    id: ++nextThreadEventSubscriberId,
    threadId,
    closed: false,
    pending: [],
    resolveNext: null,
  };
  threadEventSubscribers.set(subscriber.id, subscriber);

  return (async function* () {
    try {
      while (true) {
        const event = await nextThreadEvent(subscriber);
        if (!event) {
          break;
        }
        yield event;
      }
    } finally {
      stopThreadEventSubscription(subscriber);
    }
  })();
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getResumeText(projectId: string): Promise<string | null> {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return null;
  const docs = await db.select().from(documents).where(eq(documents.projectId, projectId)).all();
  const extracted = docs.find((d) => d.kind === "extracted_text");
  const source = docs.find(
    (d) => d.kind === "resume_source" && d.id === project.activeResumeSourceId,
  );
  return (extracted?.content ?? source?.content ?? "").trim() || null;
}

async function getProfile(projectId: string): Promise<StructuredProfile | null> {
  const row = await db.select().from(profiles).where(eq(profiles.projectId, projectId)).get();
  if (!row) return null;
  return JSON.parse(row.profileJson) as StructuredProfile;
}

interface TopicWithContent extends TopicFileMeta {
  content: string;
}

async function getTopicsWithContent(projectId: string): Promise<TopicWithContent[]> {
  const rows = await db.select().from(topicFiles).where(eq(topicFiles.projectId, projectId)).all();

  const results: TopicWithContent[] = [];

  for (const row of rows) {
    const content = await readTopicFile(row.filePath);
    results.push({
      id: row.id,
      projectId: row.projectId,
      slug: row.slug,
      title: row.title,
      status: row.status as TopicFileMeta["status"],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      content,
    });
  }

  return results;
}

function toTopicMeta(row: {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}): TopicFileMeta {
  return {
    id: row.id,
    projectId: row.projectId,
    slug: row.slug,
    title: row.title,
    status: row.status as TopicFileMeta["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toThread(row: typeof chatThreads.$inferSelect): ChatThread {
  return {
    id: row.id,
    projectId: row.projectId,
    scope: row.scope as ChatScope,
    title: row.title,
    status: row.status as ChatThread["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function threadDefaultTitle(scope: ChatScope): string {
  return scope === "coach" ? "Coach" : "Explorer";
}

async function ensureDefaultThread(projectId: string, scope: ChatScope): Promise<ChatThread> {
  const existing = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.projectId, projectId), eq(chatThreads.scope, scope)))
    .orderBy(asc(chatThreads.createdAt))
    .get();

  if (existing) {
    return toThread(existing);
  }

  const ts = now();
  const id = makeId("thread");
  await db.insert(chatThreads).values({
    id,
    projectId,
    scope,
    title: threadDefaultTitle(scope),
    status: "active",
    createdAt: ts,
    updatedAt: ts,
  });

  return {
    id,
    projectId,
    scope,
    title: threadDefaultTitle(scope),
    status: "active",
    createdAt: ts,
    updatedAt: ts,
  };
}

async function getThread(threadId: string): Promise<typeof chatThreads.$inferSelect> {
  const thread = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).get();
  if (!thread) {
    throw new Error("Thread not found");
  }
  return thread;
}

async function touchRuntime(
  threadId: string,
  providerName: ProviderId,
  payload: Record<string, unknown>,
) {
  const ts = now();
  await db
    .insert(providerSessionRuntime)
    .values({
      threadId,
      providerName,
      adapterKey: providerName,
      status: "running",
      lastSeenAt: ts,
      resumeCursorJson: JSON.stringify({ threadId }),
      runtimePayloadJson: JSON.stringify(payload),
    })
    .onConflictDoUpdate({
      target: providerSessionRuntime.threadId,
      set: {
        status: "running",
        lastSeenAt: ts,
        runtimePayloadJson: JSON.stringify(payload),
      },
    });
}

async function writeRuntimeEvent(
  projectId: string,
  type: RuntimeEventType,
  payload: Record<string, unknown>,
) {
  await db.insert(events).values({
    id: makeId("event"),
    projectId,
    type,
    createdAt: now(),
    payloadJson: JSON.stringify(payload),
  });
}

async function emitThreadEvent(
  projectId: string,
  threadId: string,
  event: ThreadStreamEvent,
): Promise<ThreadStreamEnvelope> {
  const envelope = await appendThreadEvent(threadId, event);
  await writeRuntimeEvent(projectId, "thread.stream.event", {
    threadId,
    sequence: envelope.sequence,
    event,
  });
  publishThreadEvent(threadId, envelope);
  return envelope;
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

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
              await writeRuntimeEvent(thread.projectId, "thread.runtime.event", {
                threadId: event.threadId,
                sequence: envelope.sequence,
                event,
              });
            }),
        ),
      );
    });

    function buildSendMessageStream(
      threadId: string,
      content: string,
      selection?: ChatModelSelection,
    ): Stream.Stream<ChatStreamEvent, Error> {
      async function* generate(): AsyncGenerator<ChatStreamEvent> {
        const thread = await getThread(threadId);
        const projectId = thread.projectId;
        const threadScope = thread.scope as ChatScope;
        const turnId = makeId("turn");
        const startedAt = Date.now();
        const session = providerService.startSession(threadId, selection?.provider);
        if (!session) {
          if (selection?.provider) {
            logWarn("chat provider unavailable", { providerId: selection.provider });
          }
          logError("chat turn failed", {
            turnId,
            projectId,
            reason: "no_provider_available",
            requestedProviderId: selection?.provider,
          });
          throw new Error("No chat provider available");
        }

        const provider = providerService.pickAdapter(session.provider);
        if (!provider) {
          throw new Error("Provider session resolved to unavailable provider");
        }

        const providerModels = await providerService.modelsForSession(threadId);
        const model = resolveProviderModel(providerModels, selection);
        const effort = resolveReasoningEffort(model, selection);

        const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
        if (!project) {
          logError("chat turn failed", {
            turnId,
            projectId,
            providerId: session.provider,
            reason: "project_not_found",
          });
          throw new Error("Project not found");
        }
        const projectSlug = project.slug ?? project.id;

        logInfo("chat turn start", {
          turnId,
          projectId,
          projectSlug,
          providerId: session.provider,
          model: model.slug,
          effort,
        });

        const userMsgId = makeId("cmsg");
        await db.insert(chatMessages).values({
          id: userMsgId,
          projectId,
          threadId,
          role: "user",
          content,
          createdAt: now(),
        });

        const [resumeText, profile, topics] = await Promise.all([
          getResumeText(projectId),
          getProfile(projectId),
          getTopicsWithContent(projectId),
        ]);

        const systemPrompt = buildSystemPrompt({ resumeText, profile, topics });

        const history = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.threadId, threadId))
          .orderBy(asc(chatMessages.createdAt))
          .all();

        const recentHistory = history.slice(-30).map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        try {
          const startedTurn = providerService.respond({
            threadId,
            provider: session.provider,
            prompt: systemPrompt,
            history: recentHistory,
            selection,
            runtime: {
              cwd: ensureScopeDir(projectSlug, threadScope),
              codexHome: ensureCodexHomeDir(projectSlug, threadScope, threadId),
            },
          });
          if (!startedTurn) {
            throw new Error("Failed to start provider turn");
          }

          const providerStream = startedTurn.stream;

          for await (const chunk of providerStream) {
            const event = { type: "delta" as const, chunk };
            await emitThreadEvent(projectId, threadId, event);
            yield event;
          }

          const { text: fullResponse } = await providerStream.result;
          const cleanResponse = stripTopicMarkers(fullResponse);

          const assistantMsgId = makeId("cmsg");
          await db.insert(chatMessages).values({
            id: assistantMsgId,
            projectId,
            threadId,
            role: "assistant",
            content: cleanResponse,
            createdAt: now(),
          });

          const parsed = threadScope === "coach" ? parseTopicUpdates(fullResponse) : [];
          const updatedTopicMetas: TopicFileMeta[] = [];

          const existingBySlug = new Map(topics.map((t) => [t.slug, t]));

          for (const update of parsed) {
            const ts = now();

            if (update.kind === "create" || !existingBySlug.has(update.slug)) {
              const topicId = makeId("topic");
              const fp = topicPath(projectSlug, update.slug);

              await writeTopicFile(projectSlug, update.slug, update.content);
              await db.insert(topicFiles).values({
                id: topicId,
                projectId,
                slug: update.slug,
                title: update.title,
                status: update.status,
                filePath: fp,
                createdAt: ts,
                updatedAt: ts,
              });

              updatedTopicMetas.push({
                id: topicId,
                projectId: projectId,
                slug: update.slug,
                title: update.title,
                status: update.status,
                createdAt: ts,
                updatedAt: ts,
              });

              logInfo("chat topic created", {
                turnId,
                projectId,
                topicId,
                slug: update.slug,
                status: update.status,
              });

              const event = {
                type: "topicUpdate" as const,
                topicId,
                slug: update.slug,
                title: update.title,
                status: update.status,
                content: update.content,
              };
              await emitThreadEvent(projectId, threadId, event);
              yield event;
            } else {
              const existing = existingBySlug.get(update.slug)!;

              await writeTopicFile(projectSlug, update.slug, update.content);
              await db
                .update(topicFiles)
                .set({
                  title: update.title,
                  status: update.status,
                  filePath: topicPath(projectSlug, update.slug),
                  updatedAt: ts,
                })
                .where(eq(topicFiles.id, existing.id));

              updatedTopicMetas.push({
                ...existing,
                title: update.title,
                status: update.status,
                updatedAt: ts,
              });

              logInfo("chat topic updated", {
                turnId,
                projectId,
                topicId: existing.id,
                slug: update.slug,
                status: update.status,
              });

              const event = {
                type: "topicUpdate" as const,
                topicId: existing.id,
                slug: update.slug,
                title: update.title,
                status: update.status,
                content: update.content,
              };
              await emitThreadEvent(projectId, threadId, event);
              yield event;
            }
          }

          logInfo("chat turn complete", {
            turnId,
            threadId,
            projectId,
            providerId: session.provider,
            model: model.slug,
            effort,
            durationMs: Date.now() - startedAt,
            userMessageId: userMsgId,
            assistantMessageId: assistantMsgId,
            responseChars: cleanResponse.length,
            topicUpdates: updatedTopicMetas.length,
          });

          if (threadScope === "explorer") {
            await touchRuntime(threadId, session.provider, {
              projectId,
              scope: threadScope,
              model: model.slug,
              effort,
              providerId: session.provider,
            });
          }

          const event = {
            type: "complete" as const,
            messageId: assistantMsgId,
            content: cleanResponse,
            topicUpdates: updatedTopicMetas,
          };
          await emitThreadEvent(projectId, threadId, event);
          yield event;
        } catch (error) {
          logError("chat turn failed", {
            turnId,
            threadId,
            projectId,
            providerId: session.provider,
            model: model.slug,
            effort,
            durationMs: Date.now() - startedAt,
            userMessageId: userMsgId,
            error,
          });
          throw error;
        }
      }

      return Stream.fromAsyncIterable(generate(), (err) =>
        err instanceof Error ? err : new Error(String(err)),
      );
    }

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

      getMessages: (threadId: string) =>
        Effect.promise(async (): Promise<ChatMessage[]> => {
          const thread = await getThread(threadId);
          const rows = await db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.threadId, threadId))
            .orderBy(asc(chatMessages.createdAt))
            .all();

          return rows.map((r) => ({
            id: r.id,
            projectId: thread.projectId,
            threadId,
            role: r.role as ChatMessage["role"],
            content: r.content,
            createdAt: r.createdAt,
          }));
        }),

      sendMessage: (threadId: string, content: string, selection?: ChatModelSelection) =>
        buildSendMessageStream(threadId, content, selection),

      dispatchCommand: (command: ChatDispatchCommand) =>
        Effect.promise(async () => {
          await recordThreadCommand(command);
          if (command.type === "thread.turn.interrupt") {
            const thread = await getThread(command.threadId);
            await writeRuntimeEvent(thread.projectId, "thread.command.dispatched", {
              threadId: command.threadId,
              command: "thread.turn.interrupt",
            });
            providerService.interruptSession(command.threadId);
            return { accepted: true };
          }

          const thread = await getThread(command.threadId);
          await writeRuntimeEvent(thread.projectId, "thread.command.dispatched", {
            threadId: command.threadId,
            command: "thread.turn.start",
            contentLength: command.content.length,
            selection: command.selection ?? null,
          });
          Effect.runFork(
            Stream.runDrain(
              buildSendMessageStream(command.threadId, command.content, command.selection),
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
