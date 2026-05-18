import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat/chat-input";
import type { ChatMessage } from "@jobseeker/contracts";

import type { ExplorerRawLogLine, SessionStreamItem, SessionTabProps } from "./-explorer.types";

function buildStreamItems(
  messages: ChatMessage[],
  logs: ExplorerRawLogLine[],
  streamingContent: string,
): SessionStreamItem[] {
  const items: SessionStreamItem[] = [
    ...messages.map((message) => ({
      kind: "message" as const,
      id: message.id,
      createdAt: message.createdAt,
      role: message.role,
      content: message.content,
    })),
    ...logs.map((log) => ({
      kind: "log" as const,
      id: `log_${log.id}`,
      createdAt: log.createdAt,
      text: log.text,
    })),
  ];

  if (streamingContent.trim().length > 0) {
    items.push({
      kind: "message",
      id: "streaming_assistant",
      createdAt: new Date().toISOString(),
      role: "assistant",
      content: streamingContent,
    });
  }

  return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function SessionTab({
  activeThreadId,
  latestRunThreadId,
  onSelectLatestRun,
  logs,
  debugProviders,
  debugSelection,
  onDebugSelectionChange,
  debugMessages,
  debugStreamingContent,
  debugIsStreaming,
  debugError,
  onSendDebugMessage,
  onInterruptDebugMessage,
}: SessionTabProps) {
  const showingLatest = activeThreadId !== null && activeThreadId === latestRunThreadId;

  const streamItems = useMemo(
    () => (showingLatest ? buildStreamItems(debugMessages, logs, debugStreamingContent) : []),
    [showingLatest, debugMessages, logs, debugStreamingContent],
  );

  if (!latestRunThreadId) {
    return (
      <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card p-8 text-center">
        <p className="text-sm font-medium">No runs yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Start an explorer run from Configure & Run. The latest run's Codex session stream appears
          here.
        </p>
      </section>
    );
  }

  if (!showingLatest) {
    return (
      <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card p-8 text-center">
        <p className="text-sm font-medium">Showing latest run only</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          The session stream is scoped to the most recent run. Switch to it to view live Codex
          output.
        </p>
        <Button size="sm" onClick={onSelectLatestRun}>
          Switch to latest run
        </Button>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">Session stream</p>
        <p className="text-xs text-muted-foreground">
          Unified chat and Codex output for the latest run.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {debugError ? (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {debugError}
          </div>
        ) : null}
        {streamItems.length === 0 ? (
          <p className="flex h-full items-center justify-center rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            No session output yet. Start a run or ask Codex.
          </p>
        ) : (
          <div className="space-y-3">
            {streamItems.map((item) =>
              item.kind === "log" ? (
                <div key={item.id} className="rounded-md border bg-muted/30 p-3">
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleTimeString()} · log
                  </p>
                  <pre className="whitespace-pre-wrap text-xs leading-5">{item.text}</pre>
                </div>
              ) : (
                <div key={item.id} className="flex justify-start">
                  <div
                    className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      item.role === "user"
                        ? "ml-auto bg-foreground text-background"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="mb-1 text-[11px] opacity-70">{item.role}</p>
                    {item.content}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <ChatInput
        onSend={onSendDebugMessage}
        onInterrupt={onInterruptDebugMessage}
        disabled={debugIsStreaming || Boolean(debugError)}
        providers={debugProviders}
        selection={debugSelection}
        onSelectionChange={onDebugSelectionChange}
      />
    </section>
  );
}
