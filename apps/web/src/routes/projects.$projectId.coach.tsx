import type { ChatThread } from "@jobseeker/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TopicArtifactPanel } from "@/components/chat/topic-artifact-panel";
import { useModelChoice } from "@/hooks/use-model-choice";
import { appendThreadToCache } from "@/lib/chat-cache";
import {
  chatThreadsQueryOptions,
  chatTopicsQueryOptions,
  projectsListQueryOptions,
} from "@/lib/query-options";
import { projectsKeys } from "@/lib/query-keys";
import { projectRouteId } from "@/lib/project-route";
import { getResumeDoc } from "@/lib/project";
import { useChat } from "@/hooks/use-chat";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";
import { createThread } from "@/rpc/chat-client";
import { ResumeBanner } from "./projects.$projectId.coach/-resume-banner";
import { SessionSidebar } from "./projects.$projectId.coach/-session-sidebar";

const EMPTY_THREADS: ChatThread[] = [];

export const Route = createFileRoute("/projects/$projectId/coach")({
  loader: async ({ context, params }) => {
    const projects = await context.queryClient.ensureQueryData(projectsListQueryOptions());
    const project = projects.find((entry) => projectRouteId(entry) === params.projectId);

    if (!project) {
      return;
    }

    await Promise.all([
      context.queryClient.ensureQueryData(chatThreadsQueryOptions(project.project.id, "coach")),
      context.queryClient.ensureQueryData(chatTopicsQueryOptions(project.project.id)),
    ]);
  },
  component: ChatPage,
});

function ChatPage() {
  const { project } = useProject();
  const queryClient = useQueryClient();
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

  useShellHeaderMeta(shellHeader);

  const { providers, selection, setSelection } = useModelChoice(projectId, "coach");
  const threads = useQuery(chatThreadsQueryOptions(projectId, "coach")).data ?? EMPTY_THREADS;
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(true);

  useEffect(() => {
    setActiveThreadId((current) => current ?? threads[0]?.id ?? null);
  }, [threads]);

  const handleComplete = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
    void queryClient.invalidateQueries({ queryKey: projectsKeys.list() });
  }, [projectId, queryClient]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;

  const { messages, streamingContent, isStreaming, error, send, interrupt } = useChat({
    projectId,
    threadId: activeThreadId ?? "",
    selection,
    onComplete: handleComplete,
  });

  async function handleCreateThread() {
    const created = await createThread(projectId, "coach");
    appendThreadToCache(queryClient, projectId, "coach", created);
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
      <SessionSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={setActiveThreadId}
        onCreateThread={() => void handleCreateThread()}
        onToggleVisibility={() => setShowSessions((prev) => !prev)}
        expanded={showSessions}
      />

      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ResumeBanner resumeDoc={resumeDoc} activeThread={activeThread} projectSlug={projectSlug} />

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
      <TopicArtifactPanel projectId={projectId} initialTopics={project.topicFiles} />
    </div>
  );
}
