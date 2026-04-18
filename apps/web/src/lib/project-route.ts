import type { ProjectSnapshot } from "@jobseeker/contracts";

export function projectRouteId(project: ProjectSnapshot) {
  return project.project.slug;
}
