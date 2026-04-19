import type { ChatMessage, TopicFileMeta } from "@jobseeker/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { dispatchCommand as rpcDispatchCommand } from "@/rpc/chat-client";
import { getMessages as rpcGetMessages } from "@/rpc/chat-client";
import { getThreadProjection as rpcGetThreadProjection } from "@/rpc/chat-client";
import { subscribeThread as rpcSubscribeThread } from "@/rpc/chat-client";
import type { ChatStreamTopicUpdate, ThreadStreamEnvelope, ThreadStreamEvent } from "@/rpc/types";

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

export function useChat(options: UseChatOptions): UseChatReturn {
  const { projectId, threadId, selection, onTopicUpdate, onTopicUpdates, onComplete } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setStreamingContent("");
    setIsStreaming(false);
    setError(null);
    lastSequenceRef.current = 0;

    if (!threadId) {
      return () => {
        cancelled = true;
      };
    }

    void rpcGetMessages(threadId)
      .then((loaded) => {
        if (!cancelled) {
          setMessages(loaded);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load messages");
        }
      });

    void rpcGetThreadProjection(threadId)
      .then((projection) => {
        if (cancelled) {
          return;
        }
        lastSequenceRef.current = projection.latestSequence;
        setIsStreaming(projection.isStreaming);
        setStreamingContent(projection.assistantDraft);
      })
      .catch(() => {
        // Ignore projection bootstrap failures.
      });

    return () => {
      cancelled = true;
    };
  }, [threadId]);

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
        setStreamingContent((prev) => prev + event.chunk);
        return;
      }

      if (event.type === "topicUpdate") {
        onTopicUpdate?.(event);
        return;
      }

      if (event.type === "complete") {
        const assistantMsg: ChatMessage = {
          id: event.messageId,
          projectId,
          threadId,
          role: "assistant",
          content: event.content,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) =>
          prev.some((message) => message.id === assistantMsg.id) ? prev : [...prev, assistantMsg],
        );
        setStreamingContent("");
        setIsStreaming(false);

        if (event.topicUpdates.length > 0) {
          onTopicUpdates?.(event.topicUpdates as TopicFileMeta[]);
        }

        onComplete?.();
        return;
      }

      if (event.threadId !== threadId) {
        return;
      }

      if (event.type === "turn.started") {
        setIsStreaming(true);
        return;
      }

      if (
        event.type === "turn.completed" ||
        event.type === "turn.failed" ||
        event.type === "turn.interrupted"
      ) {
        setIsStreaming(false);
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
  }, [projectId, threadId, onTopicUpdate, onTopicUpdates, onComplete]);

  const send = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming || !threadId) return;

      setError(null);
      setIsStreaming(true);

      // Optimistically add user message
      const userMsg: ChatMessage = {
        id: `temp_${Date.now()}`,
        projectId,
        threadId,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setStreamingContent("");

      void rpcDispatchCommand({
        type: "thread.turn.start",
        threadId,
        content: trimmed,
        selection,
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to send message";
        setError(msg);
        setIsStreaming(false);
      });
    },
    [projectId, threadId, selection, isStreaming],
  );

  const interrupt = useCallback(() => {
    if (!threadId || !isStreaming) {
      return;
    }

    setError(null);
    void rpcDispatchCommand({ type: "thread.turn.interrupt", threadId }).catch((err) => {
      const msg = err instanceof Error ? err.message : "Failed to interrupt message";
      setError(msg);
    });
  }, [threadId, isStreaming]);

  return { messages, streamingContent, isStreaming, error, send, interrupt };
}
