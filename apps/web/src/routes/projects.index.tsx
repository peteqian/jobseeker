import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";

import { projectRouteId } from "@/lib/project-route";
import { getProjectStages } from "@/lib/project";
import { useJobseeker } from "@/providers/jobseeker-hooks";

const STAGE_COUNT = 5;

export const Route = createFileRoute("/projects/")({
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const { projects } = useJobseeker();

  return (
    <section id="project-list" className="space-y-5">
      <div className="flex justify-end">
        <p className="text-sm text-muted-foreground">
          {projects.length === 0
            ? "No projects yet"
            : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        </p>
      </div>

      {projects.length === 0 ? (
        <section className="rounded-lg bg-card px-6 py-10 text-center shadow-sm">
          <div className="mx-auto max-w-xl space-y-3">
            <p className="text-lg font-semibold tracking-tight">No projects yet.</p>
            <p className="text-sm text-muted-foreground">
              Use the header action to create your first project.
            </p>
          </div>
        </section>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const stages = getProjectStages(project);
            const completeCount = stages.filter((stage) => stage.complete).length;
            const nextStage = stages.find((stage) => !stage.complete) ?? stages[STAGE_COUNT - 1];
            const matchedJobs = project.jobMatches.filter((match) => match.score > 0).length;

            return (
              <Link
                key={project.project.id}
                to="/projects/$projectId"
                params={{ projectId: projectRouteId(project) }}
                className="group block rounded-lg bg-card px-5 py-4 shadow-sm transition-colors duration-200 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:px-6"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-lg font-semibold tracking-tight">
                            {project.project.title}
                          </p>
                          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatStatus(project.project.status)}. Next: {nextStage.title}.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {completeCount}/{STAGE_COUNT} steps
                        </Badge>
                        <Badge variant="outline">{matchedJobs} matches</Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground">Documents:</span>{" "}
                        {project.documents.length}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Jobs found:</span>{" "}
                        {project.jobs.length}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Next action:</span>{" "}
                        {nextStage.detail}
                      </p>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-2 text-sm text-foreground lg:shrink-0">
                    <span className="font-medium">Open project</span>
                    <ArrowRight className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatStatus(status: string) {
  return status.replace(/[_-]+/g, " ");
}
