import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";

import { projectRouteId } from "@/lib/project-route";
import { useJobseeker } from "@/providers/jobseeker-hooks";
import { ProjectContext } from "@/providers/project-context";

export const Route = createFileRoute("/projects/$projectId")({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const { projects } = useJobseeker();

  const project = projects.find((project) => projectRouteId(project) === projectId) ?? null;

  if (!project) {
    return (
      <div className="rounded-lg bg-muted/30 p-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

  return (
    <ProjectContext value={{ project }}>
      <Outlet />
    </ProjectContext>
  );
}
