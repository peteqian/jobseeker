import type { ChatMessage, TopicFileMeta } from "@jobseeker/contracts";
import { useCallback, useRef, useState } from "react";

import { sendMessage as rpcSendMessage } from "@/rpc/chat-client";
import type { ChatStreamEvent, ChatStreamTopicUpdate } from "@/rpc/types";

interface UseChatOptions {
  projectId: string;
  selection?: {
    provider?: string;
    model?: string;
    effort?: string;
  };
  initialMessages: ChatMessage[];
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
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const { projectId, selection, initialMessages, onTopicUpdate, onTopicUpdates, onComplete } =
    options;

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to avoid stale closures in the streaming callback
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Sync initial messages when they change (e.g. after a refresh)
  const prevInitialRef = useRef(initialMessages);
  if (prevInitialRef.current !== initialMessages && !isStreaming) {
    prevInitialRef.current = initialMessages;
    setMessages(initialMessages);
  }

  const send = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      // Optimistically add user message
      const userMsg: ChatMessage = {
        id: `temp_${Date.now()}`,
        projectId,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setStreamingContent("");

      let fullContent = "";

      rpcSendMessage(projectId, trimmed, selection, (event: ChatStreamEvent) => {
        if (event.type === "delta") {
          fullContent += event.chunk;
          setStreamingContent(fullContent);
        }

        if (event.type === "topicUpdate") {
          onTopicUpdate?.(event);
        }

        if (event.type === "complete") {
          const assistantMsg: ChatMessage = {
            id: event.messageId,
            projectId,
            role: "assistant",
            content: event.content,
            createdAt: new Date().toISOString(),
          };

          setMessages((prev) => [...prev, assistantMsg]);
          setStreamingContent("");

          if (event.topicUpdates.length > 0) {
            onTopicUpdates?.(event.topicUpdates as TopicFileMeta[]);
          }

          onComplete?.();
        }
      })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "Failed to send message";
          setError(msg);
        })
        .finally(() => {
          setIsStreaming(false);
        });
    },
    [projectId, selection, isStreaming, onTopicUpdate, onTopicUpdates, onComplete],
  );

  return { messages, streamingContent, isStreaming, error, send };
}
