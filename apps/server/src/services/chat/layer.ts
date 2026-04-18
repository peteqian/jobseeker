import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { asc, eq } from "drizzle-orm";
import type {
  ChatModelSelection,
  ChatMessage,
  ProviderId,
  ProviderModel,
  TopicFile,
  TopicFileMeta,
  StructuredProfile,
} from "@jobseeker/contracts";
import { CLAUDE_MODELS, CODEX_MODELS } from "@jobseeker/contracts";

import { env } from "../../env";
import { makeId } from "../../lib/ids";
import { buildSystemPrompt, parseTopicUpdates, stripTopicMarkers } from "../../prompts/chat";
import { logError, logInfo, logWarn } from "../../lib/log";
import { readTopicFile, topicPath, writeTopicFile } from "../topics";
import { db } from "../../db";
import {
  chatMessages,
  documents,
  insightCards,
  profiles,
  projects,
  topicFiles,
} from "../../db/schema";

import { ChatService, type ChatStreamEvent, type ChatProviderInfo } from "./service";

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

interface ChatProvider {
  id: ProviderId;
  models: ProviderModel[];
  available(): boolean;
  run(
    prompt: string,
    history: { role: string; content: string }[],
    selection?: ChatModelSelection,
  ): AsyncIterable<string> & {
    result: Promise<{ text: string }>;
  };
}

function resolveProviderModel(
  models: readonly ProviderModel[],
  selection?: ChatModelSelection,
): ProviderModel {
  return models.find((model) => model.slug === selection?.model) ?? models[0]!;
}

function resolveReasoningEffort(model: ProviderModel, selection?: ChatModelSelection): string {
  const effort = selection?.effort;
  return effort && model.capabilities.reasoningEffort.includes(effort)
    ? effort
    : model.capabilities.defaultEffort;
}

function makeCodexProvider(): ChatProvider {
  const binPath = process.env.CODEX_BIN ?? "codex";

  return {
    id: "codex",
    models: CODEX_MODELS,
    available() {
      try {
        const proc = Bun.spawnSync([binPath, "--version"], { stdout: "pipe", stderr: "pipe" });
        return proc.exitCode === 0;
      } catch {
        return false;
      }
    },
    run(systemPrompt, history, selection) {
      const parts: string[] = [systemPrompt, ""];
      for (const msg of history.slice(0, -1)) {
        parts.push(`${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`);
      }
      const last = history.at(-1);
      if (last) parts.push(`User: ${last.content}`);

      const model = resolveProviderModel(CODEX_MODELS, selection);
      const effort = resolveReasoningEffort(model, selection);
      const proc = Bun.spawn(
        [
          binPath,
          "exec",
          "--json",
          "--ephemeral",
          "-s",
          "read-only",
          "--model",
          model.slug,
          "--config",
          `model_reasoning_effort="${effort}"`,
          "-",
        ],
        {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      proc.stdin.write(new TextEncoder().encode(parts.join("\n")));
      proc.stdin.end();

      let fullText = "";
      const resultPromise = (async () => {
        await proc.exited;
        return { text: fullText };
      })();

      const stream = (async function* () {
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let sawDeltas = false;

        function* handleEvent(event: any): Generator<string> {
          if (event.type === "response.output_text.delta" && event.delta) {
            const delta = typeof event.delta === "string" ? event.delta : (event.delta?.text ?? "");
            if (delta) {
              sawDeltas = true;
              fullText += delta;
              yield delta;
            }
            return;
          }
          if (event.type === "item.completed" && event.item?.text && !sawDeltas) {
            fullText += event.item.text;
            yield event.item.text;
          }
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              yield* handleEvent(JSON.parse(line));
            } catch {
              // skip non-JSON lines
            }
          }
        }

        if (buffer.trim()) {
          try {
            yield* handleEvent(JSON.parse(buffer));
          } catch {
            // skip
          }
        }
      })();

      return Object.assign(stream, { result: resultPromise });
    },
  };
}

function makeClaudeProvider(): ChatProvider {
  return {
    id: "claude",
    models: CLAUDE_MODELS,
    available() {
      return Boolean(env.ANTHROPIC_API_KEY);
    },
    run(systemPrompt, history, selection) {
      let fullText = "";
      let resolveResult: (r: { text: string }) => void;
      const resultPromise = new Promise<{ text: string }>((resolve) => {
        resolveResult = resolve;
      });

      const messages = history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      const stream = (async function* () {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        const model = resolveProviderModel(CLAUDE_MODELS, selection);

        const anthropicModel =
          model.slug === "claude-haiku-4-5"
            ? "claude-haiku-4-5-20251001"
            : "claude-sonnet-4-20250514";

        const response = client.messages.stream({
          model: anthropicModel,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        });

        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            yield event.delta.text;
          }
        }

        resolveResult!({ text: fullText });
      })();

      return Object.assign(stream, { result: resultPromise });
    },
  };
}

const allProviders: ChatProvider[] = [makeCodexProvider(), makeClaudeProvider()];

function pickProvider(id?: ProviderId): ChatProvider | null {
  if (id) {
    const provider = allProviders.find((item) => item.id === id && item.available()) ?? null;
    if (!provider) {
      logWarn("chat provider unavailable", { providerId: id });
    }
    return provider;
  }

  return allProviders.find((item) => item.available()) ?? null;
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

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const ChatServiceLive = Layer.succeed(ChatService, {
  listProviders: () =>
    Effect.sync((): ChatProviderInfo[] =>
      allProviders.map((p) => ({ id: p.id, available: p.available(), models: p.models })),
    ),

  getMessages: (projectId: string) =>
    Effect.promise(async (): Promise<ChatMessage[]> => {
      const rows = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.projectId, projectId))
        .orderBy(asc(chatMessages.createdAt))
        .all();

      return rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        role: r.role as ChatMessage["role"],
        content: r.content,
        createdAt: r.createdAt,
      }));
    }),

  sendMessage: (projectId: string, content: string, selection?: ChatModelSelection) => {
    async function* generate(): AsyncGenerator<ChatStreamEvent> {
      const turnId = makeId("turn");
      const startedAt = Date.now();
      const provider = pickProvider(selection?.provider);
      if (!provider) {
        logError("chat turn failed", {
          turnId,
          projectId,
          reason: "no_provider_available",
          requestedProviderId: selection?.provider,
        });
        throw new Error("No chat provider available");
      }

      const model = resolveProviderModel(provider.models, selection);
      const effort = resolveReasoningEffort(model, selection);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
      if (!project) {
        logError("chat turn failed", {
          turnId,
          projectId,
          providerId: provider.id,
          reason: "project_not_found",
        });
        throw new Error("Project not found");
      }
      const projectSlug = project.slug ?? project.id;

      logInfo("chat turn start", {
        turnId,
        projectId,
        projectSlug,
        providerId: provider.id,
        model: model.slug,
        effort,
      });

      // Save user message
      const userMsgId = makeId("cmsg");
      await db.insert(chatMessages).values({
        id: userMsgId,
        projectId,
        role: "user",
        content,
        createdAt: now(),
      });

      // Load context
      const [resumeText, profile, topics] = await Promise.all([
        getResumeText(projectId),
        getProfile(projectId),
        getTopicsWithContent(projectId),
      ]);

      const systemPrompt = buildSystemPrompt({ resumeText, profile, topics });

      // Load history
      const history = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.projectId, projectId))
        .orderBy(asc(chatMessages.createdAt))
        .all();

      const recentHistory = history.slice(-30).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      try {
        // Stream from provider
        const providerStream = provider.run(systemPrompt, recentHistory, selection);

        for await (const chunk of providerStream) {
          yield { type: "delta" as const, chunk };
        }

        const { text: fullResponse } = await providerStream.result;
        const cleanResponse = stripTopicMarkers(fullResponse);

        // Save assistant message
        const assistantMsgId = makeId("cmsg");
        await db.insert(chatMessages).values({
          id: assistantMsgId,
          projectId,
          role: "assistant",
          content: cleanResponse,
          createdAt: now(),
        });

        // Parse and save topic updates
        const parsed = parseTopicUpdates(fullResponse);
        const updatedTopicMetas: TopicFileMeta[] = [];

        // Build a slug→row lookup for existing topics
        const existingBySlug = new Map(topics.map((t) => [t.slug, t]));

        for (const update of parsed) {
          const ts = now();

          if (update.kind === "create" || !existingBySlug.has(update.slug)) {
            // Create new topic
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

            // Yield live topic update so frontend can show it immediately
            yield {
              type: "topicUpdate" as const,
              topicId,
              slug: update.slug,
              title: update.title,
              status: update.status,
              content: update.content,
            };
          } else {
            // Update existing topic
            const existing = existingBySlug.get(update.slug)!;

            await writeTopicFile(projectSlug, update.slug, update.content);
            await db
              .update(topicFiles)
              .set({
                title: update.title,
                status: update.status,
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

            yield {
              type: "topicUpdate" as const,
              topicId: existing.id,
              slug: update.slug,
              title: update.title,
              status: update.status,
              content: update.content,
            };
          }
        }

        logInfo("chat turn complete", {
          turnId,
          projectId,
          providerId: provider.id,
          model: model.slug,
          effort,
          durationMs: Date.now() - startedAt,
          userMessageId: userMsgId,
          assistantMessageId: assistantMsgId,
          responseChars: cleanResponse.length,
          topicUpdates: updatedTopicMetas.length,
        });

        // Yield completion event
        yield {
          type: "complete" as const,
          messageId: assistantMsgId,
          content: cleanResponse,
          topicUpdates: updatedTopicMetas,
        };
      } catch (error) {
        logError("chat turn failed", {
          turnId,
          projectId,
          providerId: provider.id,
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
  },

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
      const row = await db.select().from(topicFiles).where(eq(topicFiles.id, topicId)).get();

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
      await db.update(topicFiles).set({ updatedAt: ts }).where(eq(topicFiles.id, topicId));

      return {
        ...toTopicMeta({ ...row, updatedAt: ts }),
        content,
      };
    }),
});
