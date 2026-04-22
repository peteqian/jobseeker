import { useMemo, useState } from "react";
import { FileSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ResultsTabProps,
  DomainRailButtonProps,
  JobResultCardProps,
} from "./projects.$projectId.explorer/explorer.types";

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

function JobResultCard({ job, match }: JobResultCardProps) {
  return (
    <li className="rounded-md border bg-background p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium">{job.title}</h3>
            {match ? (
              <Badge variant={match.score >= 0.7 ? "default" : "secondary"} className="text-xs">
                {(match.score * 100).toFixed(0)}%
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{job.company}</span>
            <span>·</span>
            <span>{job.location}</span>
            {job.salary ? (
              <>
                <span>·</span>
                <span>{job.salary}</span>
              </>
            ) : null}
            <span>·</span>
            <span>{new Date(job.createdAt).toLocaleDateString()}</span>
          </div>
          {job.summary ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{job.summary}</p>
          ) : null}
          {match && (match.reasons.length > 0 || match.gaps.length > 0) ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {match.reasons.slice(0, 3).map((reason) => (
                <Badge key={reason} variant="secondary" className="text-xs">
                  {reason}
                </Badge>
              ))}
              {match.gaps.slice(0, 2).map((gap) => (
                <Badge key={gap} variant="outline" className="text-xs">
                  gap: {gap}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <a
          href={job.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
        </a>
      </div>
    </li>
  );
}

export function ResultsTab({ domains, jobs, matches }: ResultsTabProps) {
  const [selectedDomain, setSelectedDomain] = useState<string | "all">("all");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [minScore, setMinScore] = useState(0);

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

  if (jobs.length === 0) {
    return (
      <section className="rounded-lg bg-card p-10 text-center shadow-sm">
        <FileSearch className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-4 font-medium">No results yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run the explorer from the Config tab to collect jobs.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-4 rounded-lg bg-card p-4 shadow-sm md:grid-cols-[220px_1fr]">
      <aside className="space-y-1 border-border/50 md:border-r md:pr-3">
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

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
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
          <ul className="space-y-2">
            {visibleJobs.map((job) => (
              <JobResultCard key={job.id} job={job} match={matchByJobId.get(job.id)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
