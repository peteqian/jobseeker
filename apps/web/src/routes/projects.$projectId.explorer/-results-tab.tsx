import { useEffect, useMemo, useState } from "react";
import { FileSearch } from "lucide-react";

import { projectRouteId } from "@/lib/project-route";
import { useProjectStore } from "@/stores/project-store";
import { useProjectEvents } from "@/hooks/use-project-events";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ResultsTabProps } from "./-explorer.types";
import { JobResultCard } from "./-components/job-result-card";
import { JobDetailPane } from "./-components/job-detail-pane";

function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

type GenerateType = "resume_tailoring" | "cover_letter_tailoring";

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
  onApply,
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

  // Latest apply phase per job, correlated by the jobId the server echoes on
  // apply_job progress events. Events are chronological, so last write wins.
  const applyByJob = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      if (event.type !== "task.progress") continue;
      const payload = event.payload as Record<string, unknown>;
      if (payload.taskType !== "apply_job") continue;
      const jobId = typeof payload.jobId === "string" ? payload.jobId : null;
      const phase = typeof payload.phase === "string" ? payload.phase : null;
      if (jobId && phase) map.set(jobId, phase);
    }
    return map;
  }, [events]);

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
    <section className="grid h-full min-h-0 gap-4 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      {/* Left: filters + role list */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input
            value={keywordFilter}
            onChange={(event) => setKeywordFilter(event.target.value)}
            placeholder="Filter by title, company, location…"
            className="min-w-40 flex-1"
          />
          <select
            value={selectedDomain}
            onChange={(event) => setSelectedDomain(event.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="all">All domains ({jobs.length})</option>
            {domains.map((entry) => (
              <option key={entry.domain} value={entry.domain}>
                {entry.domain} ({jobsByDomain.byDomain.get(entry.domain)?.length ?? 0})
              </option>
            ))}
            {jobsByDomain.other.length > 0 ? (
              <option value="__other__">Other ({jobsByDomain.other.length})</option>
            ) : null}
          </select>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="min-score" className="text-xs text-muted-foreground">
              Min
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
              className="w-16"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
      </div>

      {/* Right: detail pane */}
      <div className="min-h-0 overflow-y-auto rounded-lg border bg-card p-6 shadow-sm">
        {selectedJob ? (
          <JobDetailPane
            job={selectedJob}
            match={selectedMatch}
            documents={documents}
            projectSlug={projectSlug}
            applyPhase={applyByJob.get(selectedJob.id)}
            onApply={() => onApply(selectedJob)}
            onDelete={() => {
              void onDeleteJob(projectId, selectedJob.id);
              onSelectJob(null);
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a role to view details.
          </div>
        )}
      </div>
    </section>
  );
}
