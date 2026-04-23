import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { projectRouteId } from "@/lib/project-route";
import { projectDetailQueryOptions, projectsListQueryOptions } from "@/lib/query-options";
import { useProjectStore } from "@/stores/project-store";

export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ context, params }) => {
    const projects = await context.queryClient.ensureQueryData(projectsListQueryOptions());
    const project = projects.find((entry) => projectRouteId(entry) === params.projectId);

    if (!project) {
      throw notFound();
    }

    await context.queryClient.ensureQueryData(projectDetailQueryOptions(project.project.id));

    return { resolvedProjectId: project.project.id };
  },
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { resolvedProjectId } = Route.useLoaderData();
  const { data: project } = useQuery(projectDetailQueryOptions(resolvedProjectId));
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);

  useEffect(() => {
    if (project) {
      setCurrentProject(project);
    }
    return () => {
      setCurrentProject(null);
    };
  }, [project, setCurrentProject]);

  if (!project) {
    return (
      <div className="rounded-lg bg-muted/30 p-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

  return <Outlet />;
}
