import type { ChatModelSelection, ChatThread } from "@jobseeker/contracts";
import { type ReactNode } from "react";
import { ChevronLeft, MessagesSquare, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { ProviderOption } from "@/components/chat/provider-model-picker";
import { useChat } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";

interface ConversationsPaneProps {
  projectId: string;
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
  providers?: readonly ProviderOption[];
  selection?: ChatModelSelection;
  onSelectionChange?: (selection: ChatModelSelection) => void;
  onComplete?: () => void;
  /** Rendered above the chat for the active thread (e.g. rewrite suggestions). */
  bannerSlot?: ReactNode;
  /** Rendered in the list header next to the title (e.g. scope filter chips). */
  listHeaderExtra?: ReactNode;
  emptyHint?: string;
  /** "split" = list + chat side by side (wide). "stack" = one at a time (narrow dock). */
  variant?: "split" | "stack";
  /** In stack mode, go back from the chat to the list. */
  onBack?: () => void;
}

export function ConversationsPane({
  projectId,
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  providers,
  selection,
  onSelectionChange,
  onComplete,
  bannerSlot,
  listHeaderExtra,
  emptyHint = "Start a new conversation to be interviewed about your experience.",
  variant = "split",
  onBack,
}: ConversationsPaneProps) {
  const { messages, streamingContent, isStreaming, error, send, interrupt } = useChat({
    projectId,
    threadId: activeThreadId ?? "",
    selection,
    onComplete,
  });

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;
  const stack = variant === "stack";
  // In stack mode only one column is shown at a time.
  const showList = !stack || !activeThreadId;
  const showChat = !stack || Boolean(activeThreadId);

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          "flex shrink-0 flex-col bg-muted/20",
          stack ? "w-full" : "w-60 border-r",
          showList ? "flex" : "hidden",
        )}
      >
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conversations
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New conversation"
              onClick={onNewThread}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {listHeaderExtra}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {threads.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">No conversations yet.</p>
          ) : (
            threads.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "group/row mb-1 flex items-center gap-1 rounded-md pr-1",
                  t.id === activeThreadId ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectThread(t.id)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 text-left"
                >
                  <span className="line-clamp-2 text-xs font-medium leading-snug">{t.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(t.updatedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${t.title}`}
                  onClick={() => onDeleteThread(t.id)}
                  className="hidden shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover/row:block"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {activeThreadId && showChat ? (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-0.5 border-b px-4 py-2">
            <div className="flex items-center gap-2">
              {stack && onBack ? (
                <button
                  type="button"
                  aria-label="Back to conversations"
                  onClick={onBack}
                  className="-ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                </button>
              ) : (
                <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-sm font-medium">
                {activeThread?.title ?? "Conversation"}
              </span>
            </div>
            <span className="pl-6 text-[11px] text-muted-foreground">
              Memory stays with the first model used here — switching the model restarts the
              conversation context.
            </span>
          </div>
          {bannerSlot}
          <ChatPanel
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            error={error}
            onSend={send}
            onInterrupt={interrupt}
            providers={providers}
            selection={selection}
            onSelectionChange={onSelectionChange}
            className="min-h-0 flex-1"
          />
        </div>
      ) : showChat ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <MessagesSquare className="size-8 text-muted-foreground" />
          <p className="max-w-xs text-sm text-muted-foreground">{emptyHint}</p>
          <Button size="sm" onClick={onNewThread}>
            <Plus className="size-4" />
            New conversation
          </Button>
        </div>
      ) : null}
    </div>
  );
}
