import {
  ExternalLink,
  Trash2,
  FileText,
  Mail,
  Loader2,
  Download,
  Pencil,
  Send,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { downloadMarkdownPdf } from "@/lib/resume-pdf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getMatchTier } from "./types";

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
  documents,
  projectSlug,
  applyPhase,
  onApply,
  onDelete,
}: {
  job: import("@jobseeker/contracts").JobRecord;
  match?: import("@jobseeker/contracts").JobMatch;
  documents: import("@jobseeker/contracts").ProjectDocument[];
  projectSlug: string;
  applyPhase: string | undefined;
  onApply: () => void;
  onDelete: () => void;
}) {
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
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold leading-snug">{job.title}</h2>
        <p className="text-sm text-muted-foreground">
          {job.company} · {job.location}
          {job.salary ? ` · ${job.salary}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {match ? (
          <Badge variant={getMatchTier(match.score).variant}>
            {getMatchTier(match.score).label} · {(match.score * 100).toFixed(0)}%
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
            Open on SEEK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>

      {applyStatus ? (
        <div className={`rounded-md border px-3 py-2 text-sm ${statusToneClass}`}>
          {applyStatus.message}
        </div>
      ) : null}

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

      {job.summary ? (
        <>
          <Separator />
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Summary
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{job.summary}</p>
          </div>
        </>
      ) : null}

      {resumeDoc || coverLetterDoc ? (
        <>
          <Separator />
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Generated materials
            </p>
            <div className="space-y-3">
              {resumeDoc ? (
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4" />
                      <span className="text-sm font-medium">Tailored Resume</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Link
                        to="/projects/$projectId/jobs/$jobId/editor"
                        params={{ projectId: projectSlug, jobId: job.id }}
                        search={{ kind: "resume" }}
                      >
                        <Button size="sm" variant="outline">
                          <Pencil className="size-3.5 mr-1" />
                          Edit
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void downloadMarkdownPdf(
                            resumeDoc.content ?? "",
                            sanitizeFilename(`resume-${job.company}-${job.title}`),
                          )
                        }
                        disabled={!resumeDoc.content}
                      >
                        <Download className="size-3.5 mr-1" />
                        PDF
                      </Button>
                    </div>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {resumeDoc.content}
                  </pre>
                </div>
              ) : null}
              {coverLetterDoc ? (
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Mail className="size-4" />
                      <span className="text-sm font-medium">Cover Letter</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Link
                        to="/projects/$projectId/jobs/$jobId/editor"
                        params={{ projectId: projectSlug, jobId: job.id }}
                        search={{ kind: "cover_letter" }}
                      >
                        <Button size="sm" variant="outline">
                          <Pencil className="size-3.5 mr-1" />
                          Edit
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void downloadMarkdownPdf(
                            coverLetterDoc.content ?? "",
                            sanitizeFilename(`cover-letter-${job.company}-${job.title}`),
                          )
                        }
                        disabled={!coverLetterDoc.content}
                      >
                        <Download className="size-3.5 mr-1" />
                        PDF
                      </Button>
                    </div>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {coverLetterDoc.content}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
