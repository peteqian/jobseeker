import { CheckCircle2, CircleDotDashed } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";

import { projectRouteId } from "@/lib/project-route";
import { getProjectStages } from "@/lib/project";
import { useMemo } from "react";
import { useShellHeader } from "@/providers/shell-header-context";
import { useProject } from "@/providers/project-context";

export const Route = createFileRoute("/projects/$projectId/")({
  component: WorkspaceOverviewPage,
});

function WorkspaceOverviewPage() {
  const { project } = useProject();
  const stages = getProjectStages(project);
  const nextStage = stages.find((stage) => !stage.complete);
  const shellHeader = useMemo(
    () => ({
      title: project.project.title,
      description:
        "Open this project to continue the job search flow from intake through tailoring.",
    }),
    [project.project.title],
  );

  useShellHeader(shellHeader);

  return (
    <div className="mx-auto max-w-6xl space-y-5 lg:space-y-6">
      <section className="space-y-4 rounded-lg bg-card p-6 shadow-sm">
        <div className="flex justify-end">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{project.project.status}</Badge>
            <Badge variant="outline">{project.documents.length} documents</Badge>
            <Badge variant="outline">{project.jobs.length} jobs</Badge>
          </div>
        </div>

        <div className="grid gap-2.5 lg:grid-cols-5">
          {stages.map((stage) => {
            const stageRoute = stageLink(stage.id);

            return (
              <Link
                key={stage.id}
                to={stageRoute}
                params={{ projectId: projectRouteId(project) }}
                className="rounded-lg bg-background p-3.5 shadow-sm transition-colors hover:bg-accent/40 lg:p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{stage.title}</p>
                  {stage.complete ? (
                    <CheckCircle2 className="size-4 text-foreground" />
                  ) : (
                    <CircleDotDashed className="size-4 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{stage.detail}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {nextStage ? (
        <section className="rounded-lg bg-card p-5 shadow-sm lg:p-6">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Next step
            </p>
            <h3 className="text-xl font-semibold tracking-tight">{nextStage.title}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{nextStage.detail}</p>
          </div>
          <div className="mt-4">
            <Link
              to={stageLink(nextStage.id)}
              params={{ projectId: projectRouteId(project) }}
              className={buttonVariants()}
            >
              Go to {nextStage.title.toLowerCase()}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function stageLink(stageId: string) {
  const routes: Record<string, string> = {
    resume: "/projects/$projectId/resume",
    profile: "/projects/$projectId/profile",
    questions: "/projects/$projectId/coach",
    explorer: "/projects/$projectId/explorer",
    tailor: "/projects/$projectId/tailoring",
  };

  return routes[stageId] ?? "/projects/$projectId";
}
