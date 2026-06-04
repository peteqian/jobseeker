import { Minus, Plus, X } from "lucide-react";
import type { ApplicationStatus, JobApplication } from "@jobseeker/contracts";

import { Button } from "@/components/ui/button";
import { useClearJobApplication, useUpdateJobApplication } from "@/hooks/use-project-mutations";

export const APPLICATION_STATUSES: Array<{ value: ApplicationStatus; label: string }> = [
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

export function getApplicationStatusLabel(status: ApplicationStatus): string {
  return APPLICATION_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

/**
 * Inline controls to record where an application sits in the hiring funnel:
 * status, interview rounds, and untracking. Shared between the explorer job
 * detail pane and the tracker page so both stay in sync via the snapshot.
 */
export function JobApplicationTracker({
  projectId,
  jobId,
  application,
}: {
  projectId: string;
  jobId: string;
  application: JobApplication | undefined;
}) {
  const updateApplication = useUpdateJobApplication();
  const clearApplication = useClearJobApplication();
  const busy = updateApplication.isPending || clearApplication.isPending;

  if (!application) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => updateApplication.mutate({ projectId, jobId, input: { status: "applied" } })}
      >
        Mark as applied
      </Button>
    );
  }

  const setRounds = (rounds: number) => {
    updateApplication.mutate({
      projectId,
      jobId,
      input: { status: application.status, interviewRounds: Math.max(0, rounds) },
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={application.status}
        disabled={busy}
        onChange={(event) =>
          updateApplication.mutate({
            projectId,
            jobId,
            input: { status: event.target.value as ApplicationStatus },
          })
        }
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        {APPLICATION_STATUSES.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1 rounded-md border px-1.5 py-0.5">
        <span className="text-xs text-muted-foreground">Rounds</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          disabled={busy || application.interviewRounds === 0}
          aria-label="Decrease interview rounds"
          onClick={() => setRounds(application.interviewRounds - 1)}
        >
          <Minus className="size-3" />
        </Button>
        <span className="w-4 text-center text-sm tabular-nums">{application.interviewRounds}</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          disabled={busy}
          aria-label="Increase interview rounds"
          onClick={() => setRounds(application.interviewRounds + 1)}
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-muted-foreground hover:text-destructive"
        disabled={busy}
        aria-label="Stop tracking this application"
        title="Stop tracking"
        onClick={() => clearApplication.mutate({ projectId, jobId })}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
