import type { ChatThread, TopicFileMeta } from "@jobseeker/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TopicArtifactPanel } from "@/components/chat/topic-artifact-panel";

import { useModelChoice } from "@/hooks/use-model-choice";
import { projectRouteId } from "@/lib/project-route";
import type { ChatStreamTopicUpdate } from "@/rpc/types";
import { getResumeDoc } from "@/lib/project";
import { useChat } from "@/hooks/use-chat";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { useShellHeader } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";
import { createThread, listThreads } from "@/rpc/chat-client";

export const Route = createFileRoute("/projects/$projectId/coach")({
  component: ChatPage,
});

function ChatPage() {
  const { project } = useProject();
  const { refreshProjects } = useJobseeker();
  const resumeDoc = getResumeDoc(project);
  const projectId = project.project.id;
  const projectSlug = projectRouteId(project);

  const shellHeader = useMemo(
    () => ({
      title: "Coach",
      description: "Talk through your resume positioning with an AI career coach.",
    }),
    [],
  );

  useShellHeader(shellHeader);

  const { providers, selection, setSelection } = useModelChoice(projectId, "coach");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listThreads(projectId, "coach").then((rows) => {
      if (cancelled) return;
      setThreads(rows);
      setActiveThreadId((current) => current ?? rows[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Track topic files locally so new ones show immediately
  const [topicFiles, setTopicFiles] = useState<TopicFileMeta[]>(project.topicFiles);

  // Live content map — holds content pushed from streaming before fetch
  const [liveContent, setLiveContent] = useState(() => new Map<string, string>());

  const handleTopicUpdate = useCallback(
    (update: ChatStreamTopicUpdate) => {
      setLiveContent((prev) => new Map(prev).set(update.topicId, update.content));

      // Upsert the topic in local state
      setTopicFiles((prev) => {
        const exists = prev.find((t) => t.id === update.topicId);
        if (exists) {
          return prev.map((t) =>
            t.id === update.topicId
              ? {
                  ...t,
                  title: update.title,
                  status: update.status,
                  updatedAt: new Date().toISOString(),
                }
              : t,
          );
        }
        return [
          ...prev,
          {
            id: update.topicId,
            projectId: project.project.id,
            slug: update.slug,
            title: update.title,
            status: update.status,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      });
    },
    [project.project.id],
  );

  const handleTopicUpdates = useCallback((_updates: TopicFileMeta[]) => {
    // The individual topicUpdate events already handled local state.
    // This is just a confirmation — we can refresh from server for consistency.
  }, []);

  const handleComplete = useCallback(() => {
    void refreshProjects(projectId);
  }, [refreshProjects, projectId]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;

  const { messages, streamingContent, isStreaming, error, send, interrupt } = useChat({
    projectId,
    threadId: activeThreadId ?? "",
    selection,
    onTopicUpdate: handleTopicUpdate,
    onTopicUpdates: handleTopicUpdates,
    onComplete: handleComplete,
  });

  async function handleCreateThread() {
    const created = await createThread(projectId, "coach");
    setThreads((prev) => [...prev, created]);
    setActiveThreadId(created.id);
  }

  // No resume uploaded yet
  if (!resumeDoc) {
    return (
      <section className="rounded-lg bg-card p-6 shadow-sm">
        <p className="text-muted-foreground">
          Upload your resume first so the AI can review it with you.
        </p>
        <div className="mt-5">
          <Link
            to="/projects/$projectId/resume"
            params={{ projectId: projectSlug }}
            className={buttonVariants()}
          >
            Add your resume
          </Link>
        </div>
      </section>
    );
  }

  if (!activeThreadId) {
    return (
      <section className="rounded-lg bg-card p-6 shadow-sm">
        <p className="text-muted-foreground">No coach thread available yet.</p>
        <div className="mt-4">
          <Button onClick={() => void handleCreateThread()}>Create coach thread</Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden">
      {showSessions ? (
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-medium">Sessions</p>
              <p className="text-xs text-muted-foreground">Coach threads for this project</p>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => void handleCreateThread()}>
                <MessageSquarePlus className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setShowSessions(false)}>
                <PanelLeftClose className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setActiveThreadId(thread.id)}
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
      ) : (
        <aside className="flex w-12 shrink-0 flex-col items-center gap-2 rounded-lg border bg-card px-2 py-3 shadow-sm">
          <Button size="icon" variant="ghost" onClick={() => setShowSessions(true)}>
            <PanelLeftOpen className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => void handleCreateThread()}>
            <MessageSquarePlus className="size-4" />
          </Button>
        </aside>
      )}

      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="default">Active resume</Badge>
              <p className="truncate text-sm font-medium text-foreground">{resumeDoc.name}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Chat responses are grounded against this resume version.
              {activeThread ? ` Thread: ${activeThread.title}` : ""}
            </p>
          </div>

          <Link
            to="/projects/$projectId/resume"
            params={{ projectId: projectSlug }}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Manage resumes
          </Link>
        </div>

        <ChatPanel
          messages={messages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
          error={error}
          onSend={send}
          onInterrupt={interrupt}
          providers={providers}
          selection={selection}
          onSelectionChange={setSelection}
          className="min-h-0 flex-1"
        />
      </div>

      {/* Topic artifact panel */}
      <TopicArtifactPanel projectId={projectId} topics={topicFiles} liveContent={liveContent} />
    </div>
  );
}
