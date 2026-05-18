import { useEffect, useMemo, useState } from "react";
import {
  FileSearch,
  Trash2,
  ExternalLink,
  ChevronDown,
  FileText,
  Mail,
  Sparkles,
  Loader2,
  Download,
  Pencil,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { downloadMarkdownPdf } from "@/lib/resume-pdf";
import { projectRouteId } from "@/lib/project-route";
import { useProjectStore } from "@/stores/project-store";
import { useProjectEvents } from "@/hooks/use-project-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type {
  ResultsTabProps,
  DomainRailButtonProps,
  JobResultCardProps,
} from "./projects.$projectId.explorer/-explorer.types";

function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function DomainRailButton({ label, count, active, onSelect }: DomainRailButtonProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/40"
      }`}
    >
      <span className="truncate">{label}</span>
      <Badge variant="outline" className="ml-2 shrink-0 text-xs">
        {count}
      </Badge>
    </button>
  );
}

type GenerateType = "resume_tailoring" | "cover_letter_tailoring";

function JobResultCard({
  job,
  match,
  isSelected,
  onSelect,
  onDelete,
  onGenerate,
  hasResume,
  hasCoverLetter,
  generatingResume,
  generatingCoverLetter,
}: JobResultCardProps & {
  generatingResume: boolean;
  generatingCoverLetter: boolean;
}) {
  const isGenerating = generatingResume || generatingCoverLetter;
  const generateLabel =
    generatingResume && generatingCoverLetter
      ? "Generating both..."
      : generatingResume
        ? "Generating resume..."
        : generatingCoverLetter
          ? "Generating cover letter..."
          : "Generate";

  return (
    <li
      className={`group rounded-lg border bg-background p-5 transition-colors cursor-pointer ${
        isSelected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 font-medium leading-snug line-clamp-2">{job.title}</h3>
            {match ? (
              <Badge
                variant={match.score >= 0.7 ? "default" : "secondary"}
                className="shrink-0 text-xs"
              >
                {(match.score * 100).toFixed(0)}%
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{job.company}</span>
            <span aria-hidden>·</span>
            <span>{job.location}</span>
            {job.salary ? (
              <>
                <span aria-hidden>·</span>
                <span>{job.salary}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>{new Date(job.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <a
          href={job.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open listing"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      {job.summary ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{job.summary}</p>
      ) : null}

      {match && (match.reasons.length > 0 || match.gaps.length > 0) ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.reasons.slice(0, 2).map((reason) => (
            <Badge key={reason} variant="secondary" className="text-xs">
              {reason}
            </Badge>
          ))}
          {match.gaps.slice(0, 1).map((gap) => (
            <Badge key={gap} variant="outline" className="text-xs">
              gap: {gap}
            </Badge>
          ))}
        </div>
      ) : null}

      <div
        className="mt-4 flex items-center justify-between border-t pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="default" size="sm" disabled={isGenerating} />}
          >
            {isGenerating ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5 mr-1.5" />
            )}
            {generateLabel}
            {!isGenerating && <ChevronDown className="size-3 ml-1.5" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[12rem]">
            <DropdownMenuItem
              onClick={() => onGenerate("resume_tailoring")}
              disabled={isGenerating}
              className="whitespace-nowrap"
            >
              <FileText className="size-4 mr-2" />
              Resume
              {hasResume && <span className="ml-2 text-xs text-muted-foreground">(ready)</span>}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onGenerate("cover_letter_tailoring")}
              disabled={isGenerating}
              className="whitespace-nowrap"
            >
              <Mail className="size-4 mr-2" />
              Cover Letter
              {hasCoverLetter && (
                <span className="ml-2 text-xs text-muted-foreground">(ready)</span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onGenerate("resume_tailoring");
                onGenerate("cover_letter_tailoring");
              }}
              disabled={isGenerating}
              className="whitespace-nowrap"
            >
              <Sparkles className="size-4 mr-2" />
              Both
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Delete"
          className="size-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, "_");
}

function JobDetailPane({
  job,
  match,
  documents,
  projectSlug,
}: {
  job: import("@jobseeker/contracts").JobRecord;
  match?: import("@jobseeker/contracts").JobMatch;
  documents: import("@jobseeker/contracts").ProjectDocument[];
  projectSlug: string;
}) {
  const jobDocs = documents.filter((doc) => doc.jobId === job.id);
  const resumeDoc = jobDocs.find((doc) => doc.kind === "tailored_resume");
  const coverLetterDoc = jobDocs.find((doc) => doc.kind === "cover_letter");

  if (!job) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Select a job to view details.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle className="pr-8 leading-snug">{job.title}</DialogTitle>
        <DialogDescription>
          {job.company} · {job.location}
          {job.salary ? ` · ${job.salary}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        {match ? (
          <Badge variant={match.score >= 0.7 ? "default" : "secondary"}>
            Match {(match.score * 100).toFixed(0)}%
          </Badge>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open(job.url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="size-3.5 mr-1.5" />
          Open listing
        </Button>
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
                    <li key={reason} className="text-sm leading-relaxed text-emerald-600">
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

export function ResultsTab({
  projectId,
  domains,
  jobs,
  matches,
  documents,
  selectedJobId,
  onSelectJob,
  onDeleteJob,
  onGenerate,
  busyAction,
}: ResultsTabProps) {
  const [selectedDomain, setSelectedDomain] = useState<string | "all">("all");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [generating, setGenerating] = useState<Record<string, Set<GenerateType>>>({});
  const project = useProjectStore((state) => state.currentProject);
  const projectSlug = project ? projectRouteId(project) : projectId;

  const matchByJobId = useMemo(() => {
    const lookup = new Map<string, import("@jobseeker/contracts").JobMatch>();
    for (const match of matches) {
      lookup.set(match.jobId, match);
    }
    return lookup;
  }, [matches]);

  const jobsByDomain = useMemo(() => {
    const byDomain = new Map<string, import("@jobseeker/contracts").JobRecord[]>();
    const other: import("@jobseeker/contracts").JobRecord[] = [];

    for (const job of jobs) {
      const host = extractHost(job.url);
      const matchedDomain = domains.find((entry) =>
        host ? host.includes(entry.domain.toLowerCase()) : false,
      );
      if (matchedDomain) {
        const key = matchedDomain.domain;
        const current = byDomain.get(key) ?? [];
        current.push(job);
        byDomain.set(key, current);
      } else {
        other.push(job);
      }
    }

    return { byDomain, other };
  }, [jobs, domains]);

  const visibleJobs = useMemo(() => {
    let list: import("@jobseeker/contracts").JobRecord[];
    if (selectedDomain === "all") {
      list = jobs;
    } else if (selectedDomain === "__other__") {
      list = jobsByDomain.other;
    } else {
      list = jobsByDomain.byDomain.get(selectedDomain) ?? [];
    }

    const keyword = keywordFilter.trim().toLowerCase();
    if (keyword) {
      list = list.filter((job) =>
        [job.title, job.company, job.location, job.summary]
          .join(" ")
          .toLowerCase()
          .includes(keyword),
      );
    }

    if (minScore > 0) {
      list = list.filter((job) => (matchByJobId.get(job.id)?.score ?? 0) >= minScore);
    }

    return list
      .slice()
      .sort(
        (left, right) =>
          (matchByJobId.get(right.id)?.score ?? 0) - (matchByJobId.get(left.id)?.score ?? 0),
      );
  }, [jobs, jobsByDomain, selectedDomain, keywordFilter, minScore, matchByJobId]);

  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const selectedMatch = selectedJobId ? matchByJobId.get(selectedJobId) : undefined;

  const jobDocumentMap = useMemo(() => {
    const map = new Map<string, { hasResume: boolean; hasCoverLetter: boolean }>();
    for (const job of jobs) {
      const jobDocs = documents.filter((doc) => doc.jobId === job.id);
      map.set(job.id, {
        hasResume: jobDocs.some((doc) => doc.kind === "tailored_resume"),
        hasCoverLetter: jobDocs.some((doc) => doc.kind === "cover_letter"),
      });
    }
    return map;
  }, [jobs, documents]);

  const events = useProjectEvents(projectId);

  useEffect(() => {
    setGenerating((current) => {
      const entries = Object.entries(current);
      if (entries.length === 0) return current;
      let changed = false;
      const next: Record<string, Set<GenerateType>> = {};
      for (const [jobId, types] of entries) {
        const pending = new Set<GenerateType>();
        for (const type of types) {
          const finished = events.some(
            (event) =>
              (event.type === "task.completed" || event.type === "task.failed") &&
              event.payload.jobId === jobId &&
              event.payload.taskType === type,
          );
          if (finished) {
            changed = true;
          } else {
            pending.add(type);
          }
        }
        if (pending.size > 0) {
          next[jobId] = pending;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [events]);

  const handleGenerate = (jobId: string, type: GenerateType) => {
    setGenerating((current) => {
      const existing = current[jobId] ?? new Set<GenerateType>();
      const updated = new Set(existing);
      updated.add(type);
      return { ...current, [jobId]: updated };
    });
    onGenerate(jobId, type);
  };

  if (jobs.length === 0) {
    return (
      <section className="rounded-lg bg-card p-10 text-center shadow-sm">
        <FileSearch className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-4 font-medium">No results yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run the explorer from the Configure & Run tab to collect jobs.
        </p>
      </section>
    );
  }

  return (
    <section className="grid h-full min-h-0 gap-6 overflow-hidden rounded-lg bg-card p-6 shadow-sm md:grid-cols-[220px_1fr]">
      <aside className="space-y-1 overflow-y-auto border-border/50 md:border-r md:pr-4">
        <DomainRailButton
          label="All domains"
          count={jobs.length}
          active={selectedDomain === "all"}
          onSelect={() => setSelectedDomain("all")}
        />
        {domains.map((entry) => {
          const count = jobsByDomain.byDomain.get(entry.domain)?.length ?? 0;
          return (
            <DomainRailButton
              key={entry.domain}
              label={entry.domain}
              count={count}
              active={selectedDomain === entry.domain}
              onSelect={() => setSelectedDomain(entry.domain)}
            />
          );
        })}
        {jobsByDomain.other.length > 0 ? (
          <DomainRailButton
            label="Other"
            count={jobsByDomain.other.length}
            active={selectedDomain === "__other__"}
            onSelect={() => setSelectedDomain("__other__")}
          />
        ) : null}
      </aside>

      <div className="space-y-4 min-h-0 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={keywordFilter}
            onChange={(event) => setKeywordFilter(event.target.value)}
            placeholder="Filter by title, company, location..."
            className="min-w-64 flex-1"
          />
          <div className="flex items-center gap-2">
            <Label htmlFor="min-score" className="text-xs text-muted-foreground">
              Min score
            </Label>
            <Input
              id="min-score"
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={minScore}
              onChange={(event) => {
                const value = Number.parseFloat(event.target.value);
                setMinScore(Number.isFinite(value) ? value : 0);
              }}
              className="w-20"
            />
          </div>
          <Badge variant="outline">{visibleJobs.length} results</Badge>
        </div>

        {visibleJobs.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No jobs match the current filters.
          </p>
        ) : (
          <ul className="space-y-3">
            {visibleJobs.map((job) => {
              const docStatus = jobDocumentMap.get(job.id) ?? {
                hasResume: false,
                hasCoverLetter: false,
              };
              const active = generating[job.id];
              return (
                <JobResultCard
                  key={job.id}
                  job={job}
                  match={matchByJobId.get(job.id)}
                  isSelected={job.id === selectedJobId}
                  onSelect={() => onSelectJob(job.id)}
                  onDelete={() => void onDeleteJob(projectId, job.id)}
                  onGenerate={(type) => handleGenerate(job.id, type)}
                  busyAction={busyAction}
                  hasResume={docStatus.hasResume}
                  hasCoverLetter={docStatus.hasCoverLetter}
                  generatingResume={active?.has("resume_tailoring") ?? false}
                  generatingCoverLetter={active?.has("cover_letter_tailoring") ?? false}
                />
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={Boolean(selectedJob)}
        onOpenChange={(open) => {
          if (!open) onSelectJob(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selectedJob ? (
            <JobDetailPane
              job={selectedJob}
              match={selectedMatch}
              documents={documents}
              projectSlug={projectSlug}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
