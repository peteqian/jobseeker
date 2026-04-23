import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionSidebarProps } from "./projects.$projectId.coach/-coach.types";

export function SessionSidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  onToggleVisibility,
  expanded,
}: SessionSidebarProps) {
  if (!expanded) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-2 rounded-lg border bg-card px-2 py-3 shadow-sm">
        <Button size="icon" variant="ghost" onClick={onToggleVisibility}>
          <PanelLeftOpen className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onCreateThread}>
          <MessageSquarePlus className="size-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">Sessions</p>
          <p className="text-xs text-muted-foreground">Coach threads for this project</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onCreateThread}>
            <MessageSquarePlus className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onToggleVisibility}>
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => onSelectThread(thread.id)}
            className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
              thread.id === activeThreadId
                ? "border-primary/50 bg-primary/10"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            <p className="truncate text-sm font-medium text-foreground">{thread.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(thread.updatedAt).toLocaleString()}
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}
