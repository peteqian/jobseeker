import * as Stream from "effect/Stream";
import { asc, eq } from "drizzle-orm";
import type { ChatModelSelection, ChatScope, TopicFileMeta } from "@jobseeker/contracts";

import type { ProviderServiceShape } from "../../provider/services/providerService";
import { resolveProviderModel, resolveReasoningEffort } from "../../provider/utils";
import { db } from "../../db";
import { chatMessages, projects, topicFiles } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { logError, logInfo, logWarn } from "../../lib/log";
import { ensureCodexHomeDir, ensureScopeDir } from "../../lib/paths";
import { buildSystemPrompt, parseTopicUpdates, stripTopicMarkers } from "../../prompts/chat";
import { topicPath, writeTopicFile } from "../topics";
import { getProfile, getResumeText, getThread, getTopicsWithContent } from "./repository";
import { emitThreadEvent, touchRuntime } from "./runtimeEvents";
import type { ChatStreamEvent } from "./service";

function now(): string {
  return new Date().toISOString();
}

export function buildSendMessageStream(
  providerService: ProviderServiceShape,
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
          const filePath = topicPath(projectSlug, update.slug);

          await writeTopicFile(projectSlug, update.slug, update.content);
          await db.insert(topicFiles).values({
            id: topicId,
            projectId,
            slug: update.slug,
            title: update.title,
            status: update.status,
            filePath,
            createdAt: ts,
            updatedAt: ts,
          });

          updatedTopicMetas.push({
            id: topicId,
            projectId,
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
          continue;
        }

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
