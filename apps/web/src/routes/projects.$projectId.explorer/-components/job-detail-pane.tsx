import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Trash2,
  FileText,
  Mail,
  Loader2,
  Download,
  Pencil,
  Send,
  Sparkles,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";

import { getJobDescription } from "@/lib/api";
import { jobSummaryText } from "@/lib/job-display";
import { downloadMarkdownPdf } from "@/lib/resume-pdf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getApplicationStatusLabel,
  JobApplicationTracker,
} from "@/components/job-application-tracker";
import { RecruiterReviewPanel } from "@/components/recruiter-review-panel";
import { getMatchLevelMeta } from "./types";

type GenerateType = "resume_tailoring" | "cover_letter_tailoring";

interface ApplyStatus {
  tone: "info" | "success" | "error" | "muted";
  message: string;
}

/** Maps an apply task phase to a human status line for the detail pane. */
function applyStatusFor(phase: string | undefined): ApplyStatus | null {
  switch (phase) {
    case "applying":
      return { tone: "info", message: "Applying… the agent is filling the form." };
    case "awaiting_submit":
      return {
        tone: "success",
        message: "Paused for you — review and submit in the opened browser window.",
      };
    case "skipped_low_fit":
      return { tone: "muted", message: "Skipped — fit below the apply threshold." };
    case "skipped_fit_unknown":
      return { tone: "muted", message: "Skipped — couldn't assess fit for this role." };
    case "failed":
      return { tone: "error", message: "Apply failed. Try again or open the listing manually." };
    default:
      return null;
  }
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, "_");
}

export function JobDetailPane({
  job,
  match,
  application,
  documents,
  projectSlug,
  applyPhase,
  resumeReview,
  coverLetterReview,
  generatingResume,
  generatingCoverLetter,
  onGenerate,
  onApply,
  onDelete,
}: {
  job: import("@jobseeker/contracts").JobRecord;
  match?: import("@jobseeker/contracts").JobMatch;
  application?: import("@jobseeker/contracts").JobApplication;
  documents: import("@jobseeker/contracts").ProjectDocument[];
  projectSlug: string;
  applyPhase: string | undefined;
  resumeReview?: import("@jobseeker/contracts").TailoringReview | null;
  coverLetterReview?: import("@jobseeker/contracts").TailoringReview | null;
  generatingResume: boolean;
  generatingCoverLetter: boolean;
  onGenerate: (type: GenerateType) => void;
  onApply: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "resume" | "cover_letter">("overview");
  const [copied, setCopied] = useState(false);

  const summary = jobSummaryText(job.summary);

  // Full crawled JD, fetched on demand (too large for the project snapshot).
  const { data: fullDescription } = useQuery({
    queryKey: ["jobs", "description", job.projectId, job.id],
    queryFn: () => getJobDescription(job.projectId, job.id),
    enabled: tab === "overview",
    staleTime: Number.POSITIVE_INFINITY,
  });
  const description = fullDescription?.trim() || summary;

  const handleCopyDescription = () => {
    if (!description) return;
    void navigator.clipboard.writeText(description).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const jobDocs = documents.filter((doc) => doc.jobId === job.id);
  const resumeDoc = jobDocs.find((doc) => doc.kind === "tailored_resume");
  const coverLetterDoc = jobDocs.find((doc) => doc.kind === "cover_letter");

  const isApplying = applyPhase === "applying";
  const applyStatus = applyStatusFor(applyPhase);
  const statusToneClass =
    applyStatus?.tone === "success"
      ? "border-emerald-500/40 text-emerald-600"
      : applyStatus?.tone === "error"
        ? "border-red-500/40 text-red-600"
        : applyStatus?.tone === "info"
          ? "border-primary/40 text-foreground"
          : "border-border text-muted-foreground";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-snug">{job.title}</h2>
          <p className="text-sm text-muted-foreground">
            {job.company} · {job.location}
            {job.salary ? ` · ${job.salary}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {job.expiredAt ? (
            <Badge variant="outline" className="text-destructive">
              Expired {new Date(job.expiredAt).toLocaleDateString()}
            </Badge>
          ) : null}
          {match ? (
            <Badge variant={getMatchLevelMeta(match.level).variant}>
              {getMatchLevelMeta(match.level).label}
              {match.level !== "pending" && match.score > 0 ? ` · ${match.score}` : ""}
            </Badge>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={onApply} disabled={isApplying}>
              {isApplying ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="size-3.5 mr-1.5" />
              )}
              {isApplying ? "Applying…" : "Apply with AI"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(job.url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="size-3.5 mr-1.5" />
              Open listing
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        </div>

        {applyStatus ? (
          <div className={`rounded-md border px-3 py-2 text-sm ${statusToneClass}`}>
            {applyStatus.message}
          </div>
        ) : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        className="min-h-0 flex-1"
      >
        <TabsList className="w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="resume">
            <FileText data-icon="inline-start" className="size-3.5" />
            Resume
            {generatingResume ? <Loader2 className="size-3 animate-spin" /> : null}
          </TabsTrigger>
          <TabsTrigger value="cover_letter">
            <Mail data-icon="inline-start" className="size-3.5" />
            Cover letter
            {generatingCoverLetter ? <Loader2 className="size-3 animate-spin" /> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 pt-1">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Application tracking
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <JobApplicationTracker
                  projectId={job.projectId}
                  jobId={job.id}
                  application={application}
                />
                {application ? (
                  <span className="text-xs text-muted-foreground">
                    {getApplicationStatusLabel(application.status)} · applied{" "}
                    {new Date(application.appliedAt).toLocaleDateString()}
                  </span>
                ) : null}
              </div>
            </div>

            {match && (match.reasons.length > 0 || match.gaps.length > 0) ? (
              <>
                <Separator />
                <div className="space-y-4">
                  {match.reasons.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Match reasons
                      </p>
                      <ul className="space-y-1">
                        {match.reasons.map((reason) => (
                          <li key={reason} className="text-sm leading-relaxed text-green-600">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {match.gaps.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Gaps
                      </p>
                      <ul className="space-y-1">
                        {match.gaps.map((gap) => (
                          <li key={gap} className="text-sm leading-relaxed text-amber-600">
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {description ? (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Description
                    </p>
                    <Button size="sm" variant="ghost" onClick={handleCopyDescription}>
                      {copied ? (
                        <Check className="size-3.5 mr-1 text-emerald-600" />
                      ) : (
                        <Copy className="size-3.5 mr-1" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </TabsContent>

        <DocumentTab
          value="resume"
          doc={resumeDoc}
          review={resumeReview}
          generating={generatingResume}
          generateType="resume_tailoring"
          generateLabel="Generate resume"
          editorKind="resume"
          pdfName={sanitizeFilename(`resume-${job.company}-${job.title}`)}
          pdfVariant="resume"
          jobId={job.id}
          projectSlug={projectSlug}
          onGenerate={onGenerate}
        />
        <DocumentTab
          value="cover_letter"
          doc={coverLetterDoc}
          review={coverLetterReview}
          generating={generatingCoverLetter}
          generateType="cover_letter_tailoring"
          generateLabel="Generate cover letter"
          editorKind="cover_letter"
          pdfName={sanitizeFilename(`cover-letter-${job.company}-${job.title}`)}
          pdfVariant="cover-letter"
          jobId={job.id}
          projectSlug={projectSlug}
          onGenerate={onGenerate}
        />
      </Tabs>
    </div>
  );
}

/**
 * One generated-document tab: actions (Edit / PDF / Generate), the recruiter
 * verdict, and a rendered preview. Empty state offers generation.
 */
function DocumentTab({
  value,
  doc,
  review,
  generating,
  generateType,
  generateLabel,
  editorKind,
  pdfName,
  pdfVariant,
  jobId,
  projectSlug,
  onGenerate,
}: {
  value: string;
  doc: import("@jobseeker/contracts").ProjectDocument | undefined;
  review: import("@jobseeker/contracts").TailoringReview | null | undefined;
  generating: boolean;
  generateType: GenerateType;
  generateLabel: string;
  editorKind: "resume" | "cover_letter";
  pdfName: string;
  pdfVariant?: "cover-letter";
  jobId: string;
  projectSlug: string;
  onGenerate: (type: GenerateType) => void;
}) {
  return (
    <TabsContent value={value} className="min-h-0 flex-1 overflow-y-auto">
      {doc ? (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onGenerate(generateType)}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="size-3.5 mr-1" />
              )}
              {generating ? "Generating…" : "Regenerate"}
            </Button>
            <div className="flex items-center gap-1">
              <Link
                to="/projects/$projectId/jobs/$jobId/editor"
                params={{ projectId: projectSlug, jobId }}
                search={{ kind: editorKind }}
              >
                <Button size="sm" variant="outline">
                  <Pencil className="size-3.5 mr-1" />
                  Edit
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void downloadMarkdownPdf(doc.content ?? "", pdfName, pdfVariant)}
                disabled={!doc.content}
              >
                <Download className="size-3.5 mr-1" />
                PDF
              </Button>
            </div>
          </div>

          {review ? <RecruiterReviewPanel review={review} /> : null}

          <div className="rounded-md border bg-background p-4 prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{doc.content ?? ""}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-40 items-center justify-center rounded-md border border-dashed p-8">
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">Nothing generated for this job yet.</p>
            <Button onClick={() => onGenerate(generateType)} disabled={generating}>
              {generating ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="size-4 mr-1" />
              )}
              {generating ? "Generating…" : generateLabel}
            </Button>
          </div>
        </div>
      )}
    </TabsContent>
  );
}
