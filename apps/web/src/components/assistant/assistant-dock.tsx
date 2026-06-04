import type { ChatThread } from "@jobseeker/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelRightClose } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConversationsPane } from "@/components/chat/conversations-pane";
import { useModelChoice } from "@/hooks/use-model-choice";
import { useCreateCoachAnchorThread } from "@/hooks/use-project-mutations";
import { appendThreadToCache, removeThreadFromCache } from "@/lib/chat-cache";
import { chatThreadsQueryOptions } from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { createThread, deleteThread } from "@/rpc/chat-client";
import { useAssistantDock } from "@/providers/assistant-dock-context";
import { useProjectStore } from "@/stores/project-store";

const EMPTY_THREADS: ChatThread[] = [];

export function AssistantDock() {
  const project = useProjectStore((state) => state.currentProject);
  const projectId = project?.project.id ?? "";
  const queryClient = useQueryClient();
  const {
    activeThreadId,
    setActiveThreadId,
    pageAnchorTypes,
    anchorRequest,
    clearAnchorRequest,
    close,
  } = useAssistantDock();

  const { providers, selection, setSelection } = useModelChoice(projectId, "coach");
  const threads =
    useQuery({ ...chatThreadsQueryOptions(projectId, "coach"), enabled: Boolean(projectId) })
      .data ?? EMPTY_THREADS;

  const createAnchorThread = useCreateCoachAnchorThread();
  const [filter, setFilter] = useState<"page" | "all">("all");

  // Process anchored-open requests: find-or-create the thread, then select it.
  useEffect(() => {
    if (!anchorRequest || !projectId) return;
    const req = anchorRequest;
    clearAnchorRequest();
    setFilter("page");
    void (async () => {
      try {
        const mapping = await createAnchorThread.mutateAsync({
          anchorType: req.anchorType,
          anchorId: req.anchorId,
        });
        setActiveThreadId(mapping.threadId);
        await queryClient.invalidateQueries({
          queryKey: ["chat", "threads", projectId, "coach"],
        });
      } catch (err) {
        console.error("Failed to open anchored conversation", err);
      }
    })();
  }, [
    anchorRequest,
    projectId,
    clearAnchorRequest,
    createAnchorThread,
    queryClient,
    setActiveThreadId,
  ]);

  const visibleThreads = useMemo(() => {
    if (filter === "all") return threads;
    return threads.filter((t) => t.anchor && pageAnchorTypes.includes(t.anchor.type));
  }, [threads, filter, pageAnchorTypes]);

  const handleNewThread = useCallback(async () => {
    const created = await createThread(projectId, "coach");
    appendThreadToCache(queryClient, projectId, "coach", created);
    setActiveThreadId(created.id);
    setFilter("all");
  }, [projectId, queryClient, setActiveThreadId]);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this conversation? This can't be undone.")) return;
      try {
        await deleteThread(id);
        removeThreadFromCache(queryClient, projectId, "coach", id);
        if (activeThreadId === id) {
          setActiveThreadId(threads.find((t) => t.id !== id)?.id ?? null);
        }
      } catch (err) {
        console.error("Failed to delete conversation", err);
      }
    },
    [projectId, queryClient, activeThreadId, threads, setActiveThreadId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-l bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold">Assistant</span>
        <Button variant="ghost" size="icon-sm" aria-label="Close assistant" onClick={close}>
          <PanelRightClose className="size-4" />
        </Button>
      </div>
      {projectId ? (
        <ConversationsPane
          projectId={projectId}
          threads={visibleThreads}
          activeThreadId={activeThreadId}
          onSelectThread={setActiveThreadId}
          onNewThread={() => void handleNewThread()}
          onDeleteThread={(id) => void handleDeleteThread(id)}
          providers={providers}
          selection={selection}
          onSelectionChange={setSelection}
          variant="stack"
          onBack={() => setActiveThreadId(null)}
          listHeaderExtra={
            <div className="flex gap-1">
              {(["page", "all"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    filter === value
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {value === "page" ? "This page" : "All"}
                </button>
              ))}
            </div>
          }
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Open a project to chat with the assistant.
        </div>
      )}
    </div>
  );
}
