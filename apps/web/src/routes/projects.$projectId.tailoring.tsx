import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import { getRankedJobs, latestDocument } from "@/lib/project";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { useShellHeaderMeta } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";

export const Route = createFileRoute("/projects/$projectId/tailoring")({
  component: TailoringPage,
});

function TailoringPage() {
  const { project } = useProject();
  const { busyAction, startTask } = useJobseeker();

  const rankedJobs = useMemo(() => getRankedJobs(project), [project]);
  const tailoredResume = latestDocument(project.documents, "tailored_resume");
  const shellHeader = useMemo(
    () => ({
      title: "Tailoring",
      description:
        "Pick a role and generate targeted application materials from the discovered matches.",
    }),
    [],
  );

  useShellHeaderMeta(shellHeader);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedJobId((current) => {
      if (current && rankedJobs.some(({ job }) => job.id === current)) return current;
      return rankedJobs[0]?.job.id ?? null;
    });
  }, [rankedJobs]);

  const selectedJob =
    rankedJobs.find(({ job }) => job.id === selectedJobId)?.job ?? rankedJobs[0]?.job ?? null;

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="space-y-5 rounded-lg bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Tailoring
          </p>
          <h3 className="text-xl font-semibold tracking-tight">Select a discovered role</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose the strongest fit from explorer results, then generate a tailored resume for that
            target role.
          </p>
        </div>

        {rankedJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No roles surfaced yet. Build the profile and run the explorer first.
          </p>
        ) : (
          <div className="space-y-3">
            {rankedJobs.map(({ job, match }) => (
              <button
                key={job.id}
                type="button"
                onClick={() => setSelectedJobId(job.id)}
                className={`w-full rounded-lg bg-background p-4 text-left shadow-sm transition-colors ${
                  selectedJob?.id === job.id ? "bg-accent" : "hover:bg-accent/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{job.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {job.company} · {job.location}
                    </p>
                  </div>
                  <Badge variant="outline">{match?.score ?? "-"}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{job.summary}</p>
              </button>
            ))}
          </div>
        )}

        <Separator />

        <Button
          onClick={() =>
            void startTask(
              {
                projectId: project.project.id,
                type: "resume_tailoring",
                jobId: selectedJobId ?? undefined,
              },
              "resume-tailoring",
            )
          }
          disabled={!selectedJobId || busyAction === "resume-tailoring"}
          className="w-fit"
        >
          <FileText className="size-4" />
          {busyAction === "resume-tailoring" ? "Tailoring..." : "Tailor resume"}
        </Button>
      </section>

      <section className="space-y-4 rounded-lg bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h3 className="text-xl font-semibold tracking-tight">Tailored resume</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {selectedJob
              ? `${selectedJob.title} · ${selectedJob.company}`
              : "No role selected yet."}
          </p>
        </div>
        {tailoredResume?.content ? (
          <Textarea
            readOnly
            value={tailoredResume.content}
            className="min-h-[22rem] font-mono text-xs"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a role and run tailoring to create a targeted resume variant.
          </p>
        )}
      </section>
    </div>
  );
}
