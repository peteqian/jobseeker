import { useMemo } from "react";
import { ClipboardList, ExternalLink } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import type { JobApplication, JobRecord } from "@jobseeker/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobApplicationTracker } from "@/components/job-application-tracker";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProjectStore } from "@/stores/project-store";

export const Route = createFileRoute("/projects/$projectId/tracker")({
  component: TrackerPage,
});

interface FunnelStats {
  total: number;
  interviewed: number;
  offers: number;
  accepted: number;
  rejected: number;
  interviewRate: number;
  offerRate: number;
  averageRounds: number;
}

/** Aggregates tracked applications into funnel counts and conversion rates. */
function computeFunnelStats(applications: JobApplication[]): FunnelStats {
  const total = applications.length;
  const interviewedApps = applications.filter(
    (app) =>
      app.interviewRounds > 0 ||
      app.status === "interviewing" ||
      app.status === "offer" ||
      app.status === "accepted",
  );
  const offers = applications.filter(
    (app) => app.status === "offer" || app.status === "accepted",
  ).length;
  const accepted = applications.filter((app) => app.status === "accepted").length;
  const rejected = applications.filter((app) => app.status === "rejected").length;
  const totalRounds = interviewedApps.reduce((sum, app) => sum + app.interviewRounds, 0);

  return {
    total,
    interviewed: interviewedApps.length,
    offers,
    accepted,
    rejected,
    interviewRate: total > 0 ? interviewedApps.length / total : 0,
    offerRate: total > 0 ? offers / total : 0,
    averageRounds: interviewedApps.length > 0 ? totalRounds / interviewedApps.length : 0,
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TrackerPage() {
  const project = useProjectStore((state) => state.currentProject);

  const shellHeader = useMemo(
    () => ({
      title: "Tracker",
      description: "Record application outcomes and see how your pipeline converts.",
    }),
    [],
  );
  useShellHeaderMeta(shellHeader);

  const applications = useMemo(() => project?.jobApplications ?? [], [project?.jobApplications]);
  const jobById = useMemo(() => {
    const lookup = new Map<string, JobRecord>();
    for (const job of project?.jobs ?? []) {
      lookup.set(job.id, job);
    }
    return lookup;
  }, [project?.jobs]);

  const trackedRows = useMemo(
    () =>
      applications
        .map((application) => ({ application, job: jobById.get(application.jobId) }))
        .filter((row): row is { application: JobApplication; job: JobRecord } => Boolean(row.job))
        .sort((left, right) =>
          right.application.appliedAt.localeCompare(left.application.appliedAt),
        ),
    [applications, jobById],
  );

  const untrackedJobs = useMemo(() => {
    const trackedIds = new Set(applications.map((application) => application.jobId));
    return (project?.jobs ?? []).filter((job) => !trackedIds.has(job.id));
  }, [applications, project?.jobs]);

  const stats = useMemo(() => computeFunnelStats(applications), [applications]);

  if (!project) {
    return (
      <div className="rounded-lg bg-muted/30 p-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

  return (
    <div className="h-full space-y-6 overflow-y-auto">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Applied" value={String(stats.total)} />
        <StatCard
          label="Interviewed"
          value={String(stats.interviewed)}
          hint={stats.total > 0 ? `${formatPercent(stats.interviewRate)} of applied` : undefined}
        />
        <StatCard
          label="Offers"
          value={String(stats.offers)}
          hint={stats.total > 0 ? `${formatPercent(stats.offerRate)} of applied` : undefined}
        />
        <StatCard label="Accepted" value={String(stats.accepted)} />
        <StatCard label="Rejected" value={String(stats.rejected)} />
        <StatCard
          label="Avg rounds"
          value={stats.interviewed > 0 ? stats.averageRounds.toFixed(1) : "–"}
          hint="per interviewed role"
        />
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        {trackedRows.length === 0 ? (
          <div className="p-10 text-center">
            <ClipboardList className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-4 font-medium">No applications tracked yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Mark a job as applied here or from the explorer detail pane to start tracking
              outcomes.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Status & rounds</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {trackedRows.map(({ application, job }) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{job.title}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {job.company} · {job.location}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(application.appliedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <JobApplicationTracker
                      projectId={project.project.id}
                      jobId={job.id}
                      application={application}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Open job listing"
                      onClick={() => window.open(job.url, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {untrackedJobs.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Not yet tracked</p>
            <Badge variant="outline">{untrackedJobs.length}</Badge>
          </div>
          <ul className="space-y-2">
            {untrackedJobs.map((job) => (
              <li
                key={job.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {job.company} · {job.location}
                  </p>
                </div>
                <JobApplicationTracker
                  projectId={project.project.id}
                  jobId={job.id}
                  application={undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
