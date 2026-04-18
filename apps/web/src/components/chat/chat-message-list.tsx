import type { ChatMessage } from "@jobseeker/contracts";
import { useEffect, useRef } from "react";

interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
}

export function ChatMessageList({ messages, streamingContent, isStreaming }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent, isStreaming]);

  if (messages.length === 0 && !streamingContent && !isStreaming) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p>Start a conversation about your resume and career goals.</p>
      </div>
    );
  }

  const showThinking = isStreaming && !streamingContent;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
      ))}

      {showThinking ? <ThinkingBubble /> : null}

      {streamingContent ? (
        <MessageBubble role="assistant" content={streamingContent} isStreaming />
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          Thinking
          <span className="inline-flex gap-0.5">
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
          </span>
        </span>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  isStreaming,
}: {
  role: string;
  content: string;
  isStreaming?: boolean;
}) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? "bg-foreground text-background" : "bg-muted text-foreground"
        }`}
      >
        {content}
        {isStreaming ? (
          <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current opacity-60" />
        ) : null}
      </div>
    </div>
  );
}
