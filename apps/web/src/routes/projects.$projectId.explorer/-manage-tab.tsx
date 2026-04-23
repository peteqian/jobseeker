import { useMemo } from "react";

import { ChatInput } from "@/components/chat/chat-input";
import type { ManageTabProps } from "./projects.$projectId.explorer/-explorer.types";

function buildSessionStreamItems(
  messages: import("@jobseeker/contracts").ChatMessage[],
  logs: import("./projects.$projectId.explorer/explorer.types").ExplorerRawLogLine[],
  streamingContent: string,
): import("./projects.$projectId.explorer/explorer.types").SessionStreamItem[] {
  const items: import("./explorer.types").SessionStreamItem[] = [
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

export function ManageTab({
  sessions,
  activeThreadId,
  onSelectSession,
  logs,
  feed,
  isRunning,
  debugProviders,
  debugSelection,
  onDebugSelectionChange,
  debugMessages,
  debugStreamingContent,
  debugIsStreaming,
  debugError,
  onSendDebugMessage,
  onInterruptDebugMessage,
}: ManageTabProps) {
  const streamItems = useMemo(
    () => buildSessionStreamItems(debugMessages, logs, debugStreamingContent),
    [debugMessages, logs, debugStreamingContent],
  );

  return (
    <section className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,0.22fr)_minmax(0,0.43fr)_minmax(0,0.35fr)]">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Explorer sessions</p>
          <p className="text-xs text-muted-foreground">Each run creates a new Codex session.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {sessions.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No sessions yet. Run Explorer to start one.
            </p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                  session.id === activeThreadId
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {session.title.replace("Run ", "")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(session.updatedAt).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Session stream</p>
          <p className="text-xs text-muted-foreground">
            Unified chat and Codex output for this run.
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

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Timeline</p>
          <p className="text-xs text-muted-foreground">Progress events for the selected session.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ExplorerLiveFeed items={feed} isRunning={isRunning} />
        </div>
      </section>
    </section>
  );
}

import { ExplorerLiveFeed } from "./-explorer-live-feed";
