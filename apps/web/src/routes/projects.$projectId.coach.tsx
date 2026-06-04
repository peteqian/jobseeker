import type { ChatThread, ResumeVersion } from "@jobseeker/contracts";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FilePlus2, FileSearch, FileText, MessagesSquare, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationsPane } from "@/components/chat/conversations-pane";
import { ProviderModelPicker } from "@/components/chat/provider-model-picker";
import { useModelChoice } from "@/hooks/use-model-choice";
import { appendThreadToCache, removeThreadFromCache } from "@/lib/chat-cache";
import {
  chatThreadsQueryOptions,
  chatTopicsQueryOptions,
  coachReviewQueryOptions,
  projectsListQueryOptions,
  resumeAnalysesQueryOptions,
  resumeVersionsQueryOptions,
} from "@/lib/query-options";
import { coachKeys, projectsKeys } from "@/lib/query-keys";
import { projectRouteId } from "@/lib/project-route";
import { getResumeDoc } from "@/lib/project";
import { cn } from "@/lib/utils";
import { useAnalysisStream } from "@/hooks/use-analysis-stream";
import { useProjectEvents } from "@/hooks/use-project-events";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useAssistantPageAnchors } from "@/providers/assistant-dock-context";
import { useProjectStore } from "@/stores/project-store";
import { createThread, deleteThread } from "@/rpc/chat-client";
import {
  useCreateCoachAnchorThread,
  useDeleteResume,
  usePasteResume,
  useStartCoachReview,
  useStartDeepCoachReview,
  useStartTask,
  useSwitchActiveResume,
  useUploadResume,
} from "@/hooks/use-project-mutations";
import { AddResumeDialog } from "./projects.$projectId.resume/-components/add-resume-dialog";
import { GapsPanel } from "./projects.$projectId.coach/-gaps-panel";
import { SuggestionsPanel } from "./projects.$projectId.coach/-suggestions-panel";
import { RunDeepReviewModal } from "./projects.$projectId.coach/-run-deep-review-modal";
import { AnalysisReport } from "./projects.$projectId.coach/-components/analysis-report";
import { AnalysisProgress } from "./projects.$projectId.coach/-components/analysis-progress";
import { PointExpansions } from "./projects.$projectId.coach/-components/point-expansions";

const EMPTY_THREADS: ChatThread[] = [];
const EMPTY_VERSIONS: ResumeVersion[] = [];
const COACH_ANCHOR_TYPES = ["claim", "gap"];

export const Route = createFileRoute("/projects/$projectId/coach")({
  loader: async ({ context, params }) => {
    const projects = await context.queryClient.ensureQueryData(projectsListQueryOptions());
    const project = projects.find((entry) => projectRouteId(entry) === params.projectId);
    if (!project) return;
    await Promise.all([
      context.queryClient.ensureQueryData(chatThreadsQueryOptions(project.project.id, "coach")),
      context.queryClient.ensureQueryData(chatTopicsQueryOptions(project.project.id)),
      context.queryClient.ensureQueryData(coachReviewQueryOptions(project.project.id)),
    ]);
  },
  component: ResumeStudioPage,
});

function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {hint ? <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

function ResumeStudioPage() {
  const project = useProjectStore((state) => state.currentProject);
  const queryClient = useQueryClient();
  const resumeDoc = project ? getResumeDoc(project) : null;
  const projectId = project?.project.id ?? "";

  const shellHeader = useMemo(
    () => ({
      title: "Resume Studio",
      description: "Upload a resume, see how it scores, then interview to sharpen each point.",
    }),
    [],
  );
  useShellHeaderMeta(shellHeader);
  useAssistantPageAnchors(COACH_ANCHOR_TYPES);

  const { providers, selection, setSelection } = useModelChoice(projectId, "coach");
  const threads = useQuery(chatThreadsQueryOptions(projectId, "coach")).data ?? EMPTY_THREADS;
  const review = useQuery(coachReviewQueryOptions(projectId)).data ?? null;
  const versions =
    useQuery({ ...resumeVersionsQueryOptions(projectId), enabled: Boolean(projectId) }).data ??
    EMPTY_VERSIONS;
  const analyses =
    useQuery({ ...resumeAnalysesQueryOptions(projectId), enabled: Boolean(resumeDoc) }).data ??
    null;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [tab, setTab] = useState<"review" | "conversations">("review");
  const [deepModalOpen, setDeepModalOpen] = useState(false);
  const [pendingGapId, setPendingGapId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const createAnchorThread = useCreateCoachAnchorThread();
  const startCoachReview = useStartCoachReview();
  const startDeepReview = useStartDeepCoachReview();
  const startTask = useStartTask();
  const uploadResume = useUploadResume();
  const pasteResume = usePasteResume();
  const switchActiveResume = useSwitchActiveResume();
  const deleteResume = useDeleteResume();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"paste" | "upload">("paste");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const events = useProjectEvents(projectId);
  const analysisRuns = useAnalysisStream(projectId);
  const hasActiveRuns = Object.keys(analysisRuns).length > 0;

  useEffect(() => {
    const profileUpdated = events.find((e) => e.type === "profile.updated");
    if (profileUpdated) {
      void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
    }
    const progress = events.find((e) => e.type === "task.progress");
    if (progress) {
      void queryClient.invalidateQueries({ queryKey: projectsKeys.resumeAnalyses(projectId) });
      void queryClient.invalidateQueries({ queryKey: coachKeys.review(projectId) });
    }
  }, [events, projectId, queryClient]);

  useEffect(() => {
    setActiveThreadId((current) => current ?? threads[0]?.id ?? null);
  }, [threads]);

  // Clear the analyzing indicator once results land.
  useEffect(() => {
    if (review || analyses?.ats || analyses?.hr) setAnalyzing(false);
  }, [review, analyses]);

  const handleComplete = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
  }, [projectId, queryClient]);

  const isBusy =
    uploadResume.isPending ||
    pasteResume.isPending ||
    switchActiveResume.isPending ||
    deleteResume.isPending;
  const canSubmit = dialogMode === "paste" ? resumeText.trim().length > 0 : Boolean(resumeFile);

  function resetDialog() {
    setResumeText("");
    setResumeFile(null);
    setDialogMode("paste");
  }

  async function refreshAfterResumeChange() {
    await queryClient.invalidateQueries({ queryKey: projectsKeys.resumeVersions(projectId) });
    await queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
  }

  async function handleDialogSubmit() {
    if (dialogMode === "upload") {
      if (!resumeFile) return;
      await uploadResume.mutateAsync({ projectId, file: resumeFile });
    } else {
      if (!resumeText.trim()) return;
      await pasteResume.mutateAsync({
        projectId,
        input: {
          text: resumeText,
          name: `${(project?.project.title ?? "resume").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-resume.md`,
        },
      });
    }
    setAnalyzing(true); // a new resume auto-dispatches analysis server-side
    await refreshAfterResumeChange();
    resetDialog();
    setDialogOpen(false);
  }

  async function handleActivateVersion(version: ResumeVersion) {
    if (version.isActive) return;
    await switchActiveResume.mutateAsync({ projectId, documentId: version.document.id });
    await refreshAfterResumeChange();
  }

  async function handleDeleteVersion(version: ResumeVersion) {
    await deleteResume.mutateAsync({ projectId, documentId: version.document.id });
    await refreshAfterResumeChange();
  }

  async function handleAnalyze() {
    if (!resumeDoc) return;
    setAnalyzing(true);
    await Promise.allSettled([
      startCoachReview.mutateAsync({
        projectId,
        resumeDocId: resumeDoc.id,
        focusArea: "Overall resume",
        modelSelection: selection,
      }),
      startTask.mutateAsync({
        projectId,
        type: "ats_analysis",
        resumeDocId: resumeDoc.id,
        modelSelection: selection,
      }),
      startTask.mutateAsync({
        projectId,
        type: "hr_analysis",
        resumeDocId: resumeDoc.id,
        modelSelection: selection,
      }),
    ]);
  }

  async function handleNewThread() {
    const created = await createThread(projectId, "coach");
    appendThreadToCache(queryClient, projectId, "coach", created);
    setActiveThreadId(created.id);
    setTab("conversations");
  }

  async function handleDeleteThread(id: string) {
    if (!window.confirm("Delete this conversation? This can't be undone.")) return;
    try {
      await deleteThread(id);
      removeThreadFromCache(queryClient, projectId, "coach", id);
      if (activeThreadId === id) {
        setActiveThreadId(threads.find((t) => t.id !== id)?.id ?? null);
      }
    } catch (err) {
      console.error("Failed to delete thread", err);
    }
  }

  async function handleExpandClaim(claimId: string) {
    setSelectedClaimId(claimId);
    setTab("conversations");
    try {
      const mapping = await createAnchorThread.mutateAsync({
        anchorType: "claim",
        anchorId: claimId,
      });
      setActiveThreadId(mapping.threadId);
      await queryClient.invalidateQueries({ queryKey: ["chat", "threads", projectId, "coach"] });
    } catch (err) {
      console.error("Failed to open claim thread", err);
    }
  }

  async function handleStartGapChat(gapId: string) {
    setPendingGapId(gapId);
    setTab("conversations");
    try {
      const mapping = await createAnchorThread.mutateAsync({ anchorType: "gap", anchorId: gapId });
      setActiveThreadId(mapping.threadId);
      await queryClient.invalidateQueries({ queryKey: ["chat", "threads", projectId, "coach"] });
    } catch (err) {
      console.error("Failed to open gap thread", err);
    } finally {
      setPendingGapId(null);
    }
  }

  async function handleDeepReviewSubmit(input: { pastedJds: string[]; useExplorer: boolean }) {
    if (!resumeDoc) return;
    await startDeepReview.mutateAsync({
      projectId,
      resumeDocId: resumeDoc.id,
      pastedJds: input.pastedJds,
      useExplorer: input.useExplorer,
    });
    setDeepModalOpen(false);
    void queryClient.invalidateQueries({ queryKey: coachKeys.review(projectId) });
  }

  const selectedClaim = review?.claims.find((c) => c.id === selectedClaimId) ?? null;
  const hasReport = Boolean(analyses?.ats || analyses?.hr);
  const hasPoints = (review?.claims.length ?? 0) > 0;
  const gaps = review?.gaps ?? [];
  const suggestions = review?.suggestions ?? [];

  const addResumeDialog = (
    <AddResumeDialog
      open={dialogOpen}
      onOpenChange={(next) => {
        setDialogOpen(next);
        if (!next) resetDialog();
      }}
      onSubmit={handleDialogSubmit}
      dialogMode={dialogMode}
      setDialogMode={setDialogMode}
      resumeText={resumeText}
      setResumeText={setResumeText}
      resumeFile={resumeFile}
      setResumeFile={setResumeFile}
      isBusy={isBusy}
      canSubmit={canSubmit}
      onReset={resetDialog}
    />
  );

  if (!project) {
    return (
      <div className="rounded-lg bg-muted/30 p-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

  if (!resumeDoc) {
    return (
      <>
        <section className="mx-auto mt-10 max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <FilePlus2 className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Add your resume to begin</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The studio reads it, scores it, and interviews you to sharpen each point.
          </p>
          <Button className="mt-5" onClick={() => setDialogOpen(true)}>
            <Upload className="size-4" />
            Add resume
          </Button>
        </section>
        {addResumeDialog}
      </>
    );
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "review" | "conversations")}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="border-b px-2 py-2">
        <TabsList variant="line">
          <TabsTrigger value="review">Review</TabsTrigger>
          <TabsTrigger value="conversations">
            <MessagesSquare className="size-4" />
            Conversations
            {threads.length ? (
              <Badge variant="secondary" className="ml-1">
                {threads.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </div>

      {/* ── Review tab ──────────────────────────────── */}
      <TabsContent value="review" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-2 py-4">
          {/* ── Your resume ─────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Your resume"
              hint="The version the coach and matching use."
              action={
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Upload className="size-4" />
                  Upload
                </Button>
              }
            />
            <div className="overflow-hidden rounded-lg border">
              {versions.map((version, index) => (
                <div
                  key={version.document.id}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2.5",
                    index > 0 && "border-t",
                    version.isActive && "bg-muted/40",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{version.document.name}</span>
                    {version.isActive ? (
                      <Badge className="shrink-0">Active</Badge>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(version.uploadedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!version.isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => void handleActivateVersion(version)}
                      >
                        Set active
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${version.document.name}`}
                      disabled={isBusy}
                      onClick={() => void handleDeleteVersion(version)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── How it reads ────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="How it reads"
              hint="Automated ATS and recruiter-style scoring."
              action={
                <ProviderModelPicker
                  providers={providers}
                  selection={selection}
                  onSelectionChange={setSelection}
                />
              }
            />
            {hasActiveRuns ? <AnalysisProgress runs={analysisRuns} /> : null}
            {hasReport ? (
              <AnalysisReport ats={analyses?.ats ?? null} hr={analyses?.hr ?? null} />
            ) : !hasActiveRuns ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
                <p className="text-sm text-muted-foreground">Not analyzed yet.</p>
                <Button size="sm" onClick={() => void handleAnalyze()}>
                  Analyze resume
                </Button>
              </div>
            ) : null}

            {/* Gaps vs target roles — populated by a deep review against job descriptions. */}
            {gaps.length ? (
              <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
                <p className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Gaps vs target roles
                </p>
                <GapsPanel
                  gaps={gaps}
                  onStartChat={(gapId) => void handleStartGapChat(gapId)}
                  pendingGapId={pendingGapId}
                />
              </div>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setDeepModalOpen(true)}
            >
              <FileSearch className="size-4" />
              Deep review against job descriptions
            </Button>
          </section>

          {/* ── Resume points ───────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Resume points"
              hint="Each line, with the fuller story the coach draws out."
            />
            {hasPoints ? (
              <PointExpansions
                claims={review!.claims}
                pointDetails={project.profile?.pointDetails ?? []}
                selectedClaimId={selectedClaimId}
                onExpandClaim={(claimId) => void handleExpandClaim(claimId)}
              />
            ) : analyzing ? (
              <div className="space-y-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
                <p className="text-sm text-muted-foreground">Breaking your resume into points…</p>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-8 w-20 shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                Analyze your resume (above) to break it into points, then interview to strengthen
                them.
              </div>
            )}
          </section>
        </div>
      </TabsContent>

      {/* ── Conversations tab ───────────────────────── */}
      <TabsContent value="conversations" className="min-h-0 flex-1 overflow-hidden">
        <ConversationsPane
          projectId={projectId}
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={setActiveThreadId}
          onNewThread={() => void handleNewThread()}
          onDeleteThread={(id) => void handleDeleteThread(id)}
          providers={providers}
          selection={selection}
          onSelectionChange={setSelection}
          onComplete={handleComplete}
          emptyHint="Sharpen a resume point from the Review tab, or start a new conversation to be interviewed about your experience."
          bannerSlot={
            selectedClaim ? (
              <div className="border-b bg-muted/20">
                <SuggestionsPanel claim={selectedClaim} suggestions={suggestions} />
              </div>
            ) : null
          }
        />
      </TabsContent>

      <RunDeepReviewModal
        open={deepModalOpen}
        onOpenChange={setDeepModalOpen}
        onSubmit={handleDeepReviewSubmit}
        submitting={startDeepReview.isPending}
      />

      {addResumeDialog}
    </Tabs>
  );
}
