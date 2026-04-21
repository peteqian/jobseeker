import type { ChatMessage, TopicFile, TopicFileMeta } from "@jobseeker/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  appendMessageToCache,
  patchThreadUpdatedAt,
  setProjectionInCache,
  setTopicInCache,
  upsertTopicMetaInCache,
} from "@/lib/chat-cache";
import { chatMessagesQueryOptions, chatProjectionQueryOptions } from "@/lib/query-options";
import { dispatchCommand as rpcDispatchCommand } from "@/rpc/chat-client";
import { subscribeThread as rpcSubscribeThread } from "@/rpc/chat-client";
import type {
  ChatStreamTopicUpdate,
  ThreadDispatchCommand,
  ThreadStreamEnvelope,
  ThreadStreamEvent,
} from "@/rpc/types";

interface UseChatOptions {
  projectId: string;
  threadId: string;
  selection?: {
    provider?: string;
    model?: string;
    effort?: string;
  };
  onTopicUpdate?: (update: ChatStreamTopicUpdate) => void;
  onTopicUpdates?: (updates: TopicFileMeta[]) => void;
  onComplete?: () => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  error: string | null;
  send: (content: string) => void;
  interrupt: () => void;
}

const EMPTY_MESSAGES: ChatMessage[] = [];

function makeCommandId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `web_${crypto.randomUUID()}`;
  }
  return `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const { projectId, threadId, selection, onTopicUpdate, onTopicUpdates, onComplete } = options;

  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const lastSequenceRef = useRef(0);
  const sessionIdRef = useRef(makeSessionId());
  const callbacksRef = useRef({ onTopicUpdate, onTopicUpdates, onComplete });

  callbacksRef.current = { onTopicUpdate, onTopicUpdates, onComplete };

  const messages =
    useQuery({ ...chatMessagesQueryOptions(threadId), enabled: Boolean(threadId) }).data ??
    EMPTY_MESSAGES;
  const projection = useQuery({
    ...chatProjectionQueryOptions(threadId),
    enabled: Boolean(threadId),
  }).data;
  const streamingContent = projection?.assistantDraft ?? "";
  const isStreaming = projection?.isStreaming ?? false;

  const patchThreadSummary = useCallback(
    (updatedAt: string) => patchThreadUpdatedAt(queryClient, projectId, threadId, updatedAt),
    [projectId, queryClient, threadId],
  );

  const upsertTopicMeta = useCallback(
    (topic: TopicFileMeta) => upsertTopicMetaInCache(queryClient, projectId, topic),
    [projectId, queryClient],
  );

  useEffect(() => {
    setError(null);
    lastSequenceRef.current = 0;

    if (!threadId) {
      return;
    }

    void queryClient
      .ensureQueryData(chatMessagesQueryOptions(threadId))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load messages"));

    void queryClient.ensureQueryData(chatProjectionQueryOptions(threadId)).catch(() => {
      // Ignore projection bootstrap failures.
    });
  }, [queryClient, threadId]);

  useEffect(() => {
    if (!projection) {
      return;
    }

    lastSequenceRef.current = projection.latestSequence;
  }, [projection]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    if (!threadId) {
      return () => {
        cancelled = true;
      };
    }

    const onThreadEvent = (envelope: ThreadStreamEnvelope) => {
      lastSequenceRef.current = Math.max(lastSequenceRef.current, envelope.sequence);
      const event = envelope.event as ThreadStreamEvent;

      if (event.type === "delta") {
        setProjectionInCache(queryClient, threadId, envelope.sequence, {
          assistantDraft: `${projection?.assistantDraft ?? ""}${event.chunk}`,
          isStreaming: true,
          updatedAt: envelope.createdAt,
        });
        patchThreadSummary(envelope.createdAt);
        return;
      }

      if (event.type === "topicUpdate") {
        const topic: TopicFile = {
          id: event.topicId,
          projectId,
          slug: event.slug,
          title: event.title,
          status: event.status,
          createdAt: envelope.createdAt,
          updatedAt: envelope.createdAt,
          content: event.content,
        };

        setTopicInCache(queryClient, projectId, topic);
        callbacksRef.current.onTopicUpdate?.(event);
        return;
      }

      if (event.type === "complete") {
        const assistantMsg: ChatMessage = {
          id: event.messageId,
          projectId,
          threadId,
          role: "assistant",
          content: event.content,
          createdAt: envelope.createdAt,
        };

        appendMessageToCache(queryClient, threadId, assistantMsg);
        setProjectionInCache(queryClient, threadId, envelope.sequence, {
          assistantDraft: "",
          isStreaming: false,
          updatedAt: envelope.createdAt,
        });
        patchThreadSummary(envelope.createdAt);

        if (event.topicUpdates.length > 0) {
          for (const topic of event.topicUpdates) {
            upsertTopicMeta(topic);
          }
          callbacksRef.current.onTopicUpdates?.(event.topicUpdates as TopicFileMeta[]);
        }

        callbacksRef.current.onComplete?.();
        return;
      }

      if (event.threadId !== threadId) {
        return;
      }

      if (event.type === "turn.started") {
        setProjectionInCache(queryClient, threadId, envelope.sequence, {
          isStreaming: true,
          updatedAt: envelope.createdAt,
        });
        patchThreadSummary(envelope.createdAt);
        return;
      }

      if (
        event.type === "turn.completed" ||
        event.type === "turn.failed" ||
        event.type === "turn.interrupted"
      ) {
        setProjectionInCache(queryClient, threadId, envelope.sequence, {
          isStreaming: false,
          updatedAt: envelope.createdAt,
        });
        patchThreadSummary(envelope.createdAt);
      }
    };

    const connect = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      try {
        await rpcSubscribeThread(threadId, onThreadEvent, lastSequenceRef.current);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Runtime stream disconnected");
        }
      }

      if (cancelled) {
        return;
      }

      await new Promise<void>((resolve) => {
        retryTimer = setTimeout(resolve, 750);
      });

      await connect();
    };

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [
    patchThreadSummary,
    projectId,
    projection?.assistantDraft,
    queryClient,
    threadId,
    upsertTopicMeta,
  ]);

  const send = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming || !threadId) return;

      setError(null);

      const userMsg: ChatMessage = {
        id: `temp_${Date.now()}`,
        projectId,
        threadId,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      appendMessageToCache(queryClient, threadId, userMsg);
      setProjectionInCache(queryClient, threadId, lastSequenceRef.current, {
        assistantDraft: "",
        isStreaming: true,
        updatedAt: userMsg.createdAt,
      });
      patchThreadSummary(userMsg.createdAt);

      const command: ThreadDispatchCommand = {
        commandId: makeCommandId(),
        createdAt: new Date().toISOString(),
        actor: "user",
        sessionId: sessionIdRef.current,
        type: "thread.turn.start",
        threadId,
        content: trimmed,
        selection,
      };

      void rpcDispatchCommand(command).catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to send message";
        setError(msg);
        setProjectionInCache(queryClient, threadId, lastSequenceRef.current, {
          isStreaming: false,
        });
      });
    },
    [isStreaming, patchThreadSummary, projectId, queryClient, selection, threadId],
  );

  const interrupt = useCallback(() => {
    if (!threadId || !isStreaming) {
      return;
    }

    setError(null);
    const command: ThreadDispatchCommand = {
      commandId: makeCommandId(),
      createdAt: new Date().toISOString(),
      actor: "user",
      sessionId: sessionIdRef.current,
      type: "thread.turn.interrupt",
      threadId,
    };

    void rpcDispatchCommand(command).catch((err) => {
      const msg = err instanceof Error ? err.message : "Failed to interrupt message";
      setError(msg);
    });
  }, [isStreaming, threadId]);

  return { messages, streamingContent, isStreaming, error, send, interrupt };
}
