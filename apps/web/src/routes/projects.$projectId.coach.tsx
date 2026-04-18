import type { TopicFileMeta } from "@jobseeker/contracts";
import { AlertCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { TopicArtifactPanel } from "@/components/chat/topic-artifact-panel";

import { useModelChoice } from "@/hooks/use-model-choice";
import { projectRouteId } from "@/lib/project-route";
import type { ChatStreamTopicUpdate } from "@/rpc/types";
import { getResumeDoc } from "@/lib/project";
import { useChat } from "@/hooks/use-chat";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { useShellHeader } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";

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

  const { messages, streamingContent, isStreaming, error, send } = useChat({
    projectId: projectId,
    selection,
    initialMessages: project.chatMessages,
    onTopicUpdate: handleTopicUpdate,
    onTopicUpdates: handleTopicUpdates,
    onComplete: handleComplete,
  });

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

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg bg-card shadow-sm">
      {/* Chat area */}
      <div className="flex flex-1 flex-col min-h-0">
        <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="default">Active resume</Badge>
              <p className="truncate text-sm font-medium text-foreground">{resumeDoc.name}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Chat responses are grounded against this resume version.
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
          onSend={send}
          disabled={isStreaming}
          providers={providers}
          selection={selection}
          onSelectionChange={setSelection}
        />
      </div>

      {/* Topic artifact panel */}
      <TopicArtifactPanel projectId={projectId} topics={topicFiles} liveContent={liveContent} />
    </div>
  );
}
