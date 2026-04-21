import type { ChatMessage, ChatThread, TopicFile, TopicFileMeta } from "@jobseeker/contracts";
import type { QueryClient } from "@tanstack/react-query";

import { chatKeys } from "@/lib/query-keys";
import type { ThreadProjectionSnapshot } from "@/rpc/types";

export function nextProjection(
  threadId: string,
  sequence: number,
  current: ThreadProjectionSnapshot | undefined,
  patch: Partial<ThreadProjectionSnapshot>,
): ThreadProjectionSnapshot {
  return {
    threadId,
    latestSequence: Math.max(sequence, current?.latestSequence ?? 0),
    isStreaming: current?.isStreaming ?? false,
    activeTurnId: current?.activeTurnId ?? null,
    assistantDraft: current?.assistantDraft ?? "",
    lastEventType: current?.lastEventType ?? null,
    lastError: current?.lastError ?? null,
    updatedAt: current?.updatedAt ?? new Date().toISOString(),
    ...patch,
  };
}

export function appendThreadToCache(
  queryClient: QueryClient,
  projectId: string,
  scope: string,
  thread: ChatThread,
) {
  queryClient.setQueryData<ChatThread[]>(chatKeys.threads(projectId, scope), (prev) =>
    prev?.some((entry) => entry.id === thread.id) ? prev : [...(prev ?? []), thread],
  );
}

export function patchThreadUpdatedAt(
  queryClient: QueryClient,
  projectId: string,
  threadId: string,
  updatedAt: string,
) {
  queryClient.setQueriesData<ChatThread[]>(
    { queryKey: ["chat", "threads", projectId] },
    (prev) =>
      prev?.map((thread) => (thread.id === threadId ? { ...thread, updatedAt } : thread)) ?? prev,
  );
}

export function appendMessageToCache(
  queryClient: QueryClient,
  threadId: string,
  message: ChatMessage,
) {
  queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(threadId), (prev = []) =>
    prev.some((entry) => entry.id === message.id) ? prev : [...prev, message],
  );
}

export function setProjectionInCache(
  queryClient: QueryClient,
  threadId: string,
  sequence: number,
  patch: Partial<ThreadProjectionSnapshot>,
) {
  queryClient.setQueryData<ThreadProjectionSnapshot>(chatKeys.projection(threadId), (current) =>
    nextProjection(threadId, sequence, current, patch),
  );
}

export function upsertTopicMetaInCache(
  queryClient: QueryClient,
  projectId: string,
  topic: TopicFileMeta,
) {
  queryClient.setQueryData<TopicFileMeta[]>(chatKeys.topics(projectId), (prev) => {
    const current = prev ?? [];
    const index = current.findIndex((entry) => entry.id === topic.id);
    if (index === -1) {
      return [...current, topic];
    }

    return current.map((entry) =>
      entry.id === topic.id
        ? {
            id: entry.id,
            projectId: topic.projectId,
            slug: topic.slug,
            title: topic.title,
            status: topic.status,
            createdAt: topic.createdAt,
            updatedAt: topic.updatedAt,
          }
        : entry,
    );
  });
}

export function setTopicInCache(queryClient: QueryClient, projectId: string, topic: TopicFile) {
  upsertTopicMetaInCache(queryClient, projectId, topic);
  queryClient.setQueryData(chatKeys.topic(projectId, topic.id), topic);
}
