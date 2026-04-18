import type { ChatMessage, ChatModelSelection } from "@jobseeker/contracts";
import { AlertCircle } from "lucide-react";

import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import type { ProviderOption } from "@/components/chat/provider-model-picker";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  error: string | null;
  onSend: (content: string) => void;
  providers?: readonly ProviderOption[];
  selection?: ChatModelSelection;
  onSelectionChange?: (selection: ChatModelSelection) => void;
  className?: string;
}

export function ChatPanel({
  messages,
  streamingContent,
  isStreaming,
  error,
  onSend,
  providers,
  selection,
  onSelectionChange,
  className,
}: ChatPanelProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {error ? (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <ChatMessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />

      <ChatInput
        onSend={onSend}
        disabled={isStreaming}
        providers={providers}
        selection={selection}
        onSelectionChange={onSelectionChange}
      />
    </div>
  );
}
