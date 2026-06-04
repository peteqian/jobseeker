import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Loader2, Save, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecruiterReviewPanel } from "@/components/recruiter-review-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { useProjectEvents } from "@/hooks/use-project-events";
import { useStartTask } from "@/hooks/use-project-mutations";
import { useUpdateDocument } from "@/hooks/use-project-mutations";
import { downloadMarkdownPdf } from "@/lib/resume-pdf";
import { deriveGeneratingByJob } from "@/lib/tailoring-activity";
import { projectRouteId } from "@/lib/project-route";
import { useProjectStore } from "@/stores/project-store";

type EditorKind = "resume" | "cover_letter";

interface Search {
  kind?: EditorKind;
}

export const Route = createFileRoute("/projects/$projectId/jobs/$jobId/editor")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    kind: search.kind === "cover_letter" ? "cover_letter" : "resume",
  }),
  component: JobEditorPage,
});

function JobEditorPage() {
  const { projectId: projectParam, jobId } = Route.useParams();
  const { kind = "resume" } = Route.useSearch();
  const project = useProjectStore((state) => state.currentProject);
  const projectId = project?.project.id ?? "";
  const events = useProjectEvents(projectId);

  const startTask = useStartTask();
  const updateDocument = useUpdateDocument();

  const job = project?.jobs.find((entry) => entry.id === jobId) ?? null;
  const documentKind = kind === "resume" ? "tailored_resume" : "cover_letter";
  const doc = useMemo(
    () =>
      project?.documents.find((entry) => entry.jobId === jobId && entry.kind === documentKind) ??
      null,
    [project?.documents, jobId, documentKind],
  );

  const tailoringKind = kind === "resume" ? "resume_tailoring" : "cover_letter_tailoring";
  const review = useMemo(
    () =>
      project?.tailoringReviews.find(
        (entry) => entry.jobId === jobId && entry.kind === tailoringKind,
      ) ?? null,
    [project?.tailoringReviews, jobId, tailoringKind],
  );

  const [content, setContent] = useState(doc?.content ?? "");
  const [baselineContent, setBaselineContent] = useState(doc?.content ?? "");
  const [rightPane, setRightPane] = useState<"preview" | "review">("preview");

  useEffect(() => {
    if (doc?.content !== undefined) {
      setContent(doc.content);
      setBaselineContent(doc.content);
    }
  }, [doc?.id, doc?.content]);

  const isGenerating = useMemo(
    () => deriveGeneratingByJob(events).get(jobId)?.has(tailoringKind) ?? false,
    [events, jobId, tailoringKind],
  );

  const dirty = content !== baselineContent;

  const handleSave = () => {
    if (!doc) return;
    updateDocument.mutate(
      { projectId, documentId: doc.id, content },
      {
        onSuccess: () => setBaselineContent(content),
      },
    );
  };

  const handleGenerate = () => {
    if (!projectId) return;
    startTask.mutate({
      projectId,
      type: kind === "resume" ? "resume_tailoring" : "cover_letter_tailoring",
      jobId,
    });
  };

  const handleRerunReview = () => {
    if (!projectId || !doc) return;
    startTask.mutate({ projectId, type: "tailoring_review", jobId, input: tailoringKind });
  };

  const history = useMemo(
    () =>
      (project?.tailoringReviewHistory ?? [])
        .filter((entry) => entry.jobId === jobId && entry.kind === tailoringKind)
        .slice(0, 6),
    [project?.tailoringReviewHistory, jobId, tailoringKind],
  );

  const handleDownload = async () => {
    if (!content) return;
    const filename = `${
      kind === "resume" ? "resume" : "cover-letter"
    }-${job?.company ?? "job"}-${job?.title ?? ""}`.replace(/[^a-z0-9-]/gi, "_");
    await downloadMarkdownPdf(content, filename, kind === "resume" ? "resume" : "cover-letter");
  };

  if (!project) {
    return (
      <div className="rounded-lg bg-muted/30 p-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

  if (!job) {
    return (
      <div className="rounded-lg bg-muted/30 p-6 text-sm text-muted-foreground">Job not found.</div>
    );
  }

  const projectSlug = projectRouteId(project);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <Link
            to="/projects/$projectId/explorer"
            params={{ projectId: projectParam ?? projectSlug }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Explorer
          </Link>
          <div>
            <h1 className="text-lg font-semibold">{job.title}</h1>
            <p className="text-xs text-muted-foreground">
              {job.company} · {job.location}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={kind}>
            <TabsList>
              <TabsTrigger
                value="resume"
                render={
                  <Link
                    to="/projects/$projectId/jobs/$jobId/editor"
                    params={{ projectId: projectParam ?? projectSlug, jobId }}
                    search={{ kind: "resume" }}
                  />
                }
              >
                Resume
              </TabsTrigger>
              <TabsTrigger
                value="cover_letter"
                render={
                  <Link
                    to="/projects/$projectId/jobs/$jobId/editor"
                    params={{ projectId: projectParam ?? projectSlug, jobId }}
                    search={{ kind: "cover_letter" }}
                  />
                }
              >
                Cover Letter
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerate}
            disabled={isGenerating || startTask.isPending}
          >
            {isGenerating || startTask.isPending ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="size-3.5 mr-1" />
            )}
            {doc ? "Regenerate" : "Generate"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRerunReview}
            disabled={!doc || dirty || isGenerating || startTask.isPending}
            title={
              dirty
                ? "Save your edits first — the review runs on the saved document"
                : "Re-run the recruiter review on the saved document"
            }
          >
            Re-run review
          </Button>
          <Button
            size="sm"
            variant={dirty ? "default" : "ghost"}
            onClick={handleSave}
            disabled={!doc || !dirty || updateDocument.isPending}
          >
            {updateDocument.isPending ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="size-3.5 mr-1" />
            )}
            {dirty ? "Save" : "Saved"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={!content}>
            <Download className="size-3.5 mr-1" />
            PDF
          </Button>
        </div>
      </header>

      {!doc && !isGenerating ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/30 p-12 text-center">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No {kind === "resume" ? "tailored resume" : "cover letter"} yet for this job.
            </p>
            <Button onClick={handleGenerate} disabled={startTask.isPending}>
              <Sparkles className="size-4 mr-1" />
              Generate {kind === "resume" ? "Resume" : "Cover Letter"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Markdown
              </Badge>
              {isGenerating ? (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Generating...
                </span>
              ) : null}
            </div>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="flex-1 font-mono text-xs resize-none"
              placeholder={isGenerating ? "Generating..." : "Markdown content"}
            />
          </div>
          <div className="flex min-h-0 flex-col">
            {/* Right pane switches between the rendered preview and the
                recruiter review so the verdict never crowds out the editor. */}
            <div className="mb-2 flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={rightPane === "preview" ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setRightPane("preview")}
              >
                Preview
              </Button>
              {review ? (
                <Button
                  type="button"
                  size="sm"
                  variant={rightPane === "review" ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setRightPane("review")}
                >
                  Review · {review.score}/100
                  {review.issues.length > 0 ? ` · ${review.issues.length} issues` : ""}
                </Button>
              ) : null}
            </div>
            {rightPane === "review" && review ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <RecruiterReviewPanel review={review} history={history} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto rounded-md border bg-background p-6 prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
