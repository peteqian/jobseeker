import { and, asc, eq } from "drizzle-orm";
import type {
  ChatMessage,
  ChatScope,
  ChatThread,
  TopicFile,
  TopicFileMeta,
} from "@jobseeker/contracts";

import { db } from "../../db";
import { chatMessages, chatThreads, topicFiles } from "../../db/schema";
import { makeId } from "../../lib/ids";
import { readProjectProfile } from "../projects/profile";
import { getProjectResumeText } from "../projects/resume";
import { readTopicFile } from "../topics";

function now(): string {
  return new Date().toISOString();
}

/** Reuses the shared project resume lookup from the chat context layer. */
export async function getResumeText(projectId: string): Promise<string | null> {
  return getProjectResumeText(projectId);
}

/** Reuses the shared project profile lookup from the chat context layer. */
export async function getProfile(projectId: string) {
  return readProjectProfile(projectId);
}

/** Loads all topic files and their current markdown content for prompt building. */
export async function loadTopicsWithContent(projectId: string): Promise<TopicFile[]> {
  const rows = await db.select().from(topicFiles).where(eq(topicFiles.projectId, projectId)).all();
  const results: TopicFile[] = [];

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

/** Maps a topic DB row into the API contract shape without loading file content. */
export function toTopicMeta(row: {
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

/** Maps a chat-thread DB row into the API contract shape. */
export function toThread(row: typeof chatThreads.$inferSelect): ChatThread {
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

/** Ensures every project/scope pair has a default active thread. */
export async function getOrCreateDefaultThread(
  projectId: string,
  scope: ChatScope,
): Promise<ChatThread> {
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

/** Looks up a thread row and fails fast when the caller references a bad id. */
export async function getThread(threadId: string): Promise<typeof chatThreads.$inferSelect> {
  const thread = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).get();
  if (!thread) {
    throw new Error("Thread not found");
  }
  return thread;
}

/** Returns persisted chat messages in chronological order for one thread. */
export async function getThreadMessages(threadId: string): Promise<ChatMessage[]> {
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
}
