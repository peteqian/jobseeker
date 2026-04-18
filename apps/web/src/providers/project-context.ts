import type { ProjectSnapshot } from "@jobseeker/contracts";
import * as React from "react";

export interface ProjectContextValue {
  project: ProjectSnapshot;
}

export const ProjectContext = React.createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const context = React.useContext(ProjectContext);

  if (!context) {
    throw new Error("useProject must be used within a project layout route");
  }

  return context;
}
