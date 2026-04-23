import type { ChatThread } from "@jobseeker/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useModelChoice } from "@/hooks/use-model-choice";
import { appendThreadToCache } from "@/lib/chat-cache";
import {
  chatThreadsQueryOptions,
  chatTopicsQueryOptions,
  coachReviewQueryOptions,
  projectsListQueryOptions,
} from "@/lib/query-options";
import { projectsKeys } from "@/lib/query-keys";
import { projectRouteId } from "@/lib/project-route";
import { getResumeDoc } from "@/lib/project";
import { useChat } from "@/hooks/use-chat";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProjectStore } from "@/stores/project-store";
import { createThread } from "@/rpc/chat-client";
import { useCreateClaimThread, useToggleCoachNextStep } from "@/hooks/use-project-mutations";
import { FocusAreaCard } from "./projects.$projectId.coach/-focus-area-card";
import { NextStepsCard } from "./projects.$projectId.coach/-next-steps-card";
import { ResumeBanner } from "./projects.$projectId.coach/-resume-banner";
import { RightRail } from "./projects.$projectId.coach/-right-rail";
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
      context.queryClient.ensureQueryData(coachReviewQueryOptions(project.project.id)),
    ]);
  },
  component: ChatPage,
});

function ChatPage() {
  const project = useProjectStore((state) => state.currentProject);
  const queryClient = useQueryClient();
  const resumeDoc = project ? getResumeDoc(project) : null;
  const projectId = project?.project.id ?? "";
  const projectSlug = project ? projectRouteId(project) : "";

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
  const review = useQuery(coachReviewQueryOptions(projectId)).data ?? null;
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(true);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const createClaimThread = useCreateClaimThread();
  const toggleNextStep = useToggleCoachNextStep(projectId);

  useEffect(() => {
    setActiveThreadId((current) => current ?? threads[0]?.id ?? null);
  }, [threads]);

  useEffect(() => {
    if (selectedClaimId === null && review?.claims[0]) {
      setSelectedClaimId(review.claims[0].id);
    }
  }, [review, selectedClaimId]);

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

  async function handleSelectClaim(claimId: string) {
    setSelectedClaimId(claimId);
    try {
      const mapping = await createClaimThread.mutateAsync(claimId);
      setActiveThreadId(mapping.threadId);
      await queryClient.invalidateQueries({ queryKey: ["chat", "threads", projectId, "coach"] });
    } catch (err) {
      console.error("Failed to open claim thread", err);
    }
  }

  const selectedClaim = review?.claims.find((c) => c.id === selectedClaimId) ?? null;

  if (!project) {
    return (
      <div className="rounded-lg bg-muted/30 p-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

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

      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        <ResumeBanner resumeDoc={resumeDoc} activeThread={activeThread} projectSlug={projectSlug} />

        {review ? (
          <FocusAreaCard
            review={review}
            selectedClaimId={selectedClaimId}
            onSelectClaim={(claimId) => void handleSelectClaim(claimId)}
          />
        ) : (
          <PendingReviewCard />
        )}

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
          className="min-h-[320px] flex-1"
        />

        {review ? (
          <NextStepsCard
            steps={review.nextSteps}
            onToggle={(stepId, completed) => toggleNextStep.mutate({ stepId, completed })}
          />
        ) : null}
      </div>

      <RightRail
        projectId={projectId}
        initialTopics={project.topicFiles}
        selectedClaim={selectedClaim}
        suggestions={review?.suggestions ?? []}
      />
    </div>
  );
}

function PendingReviewCard() {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
      Coach review running… this updates automatically when your resume finishes analyzing.
    </div>
  );
}
