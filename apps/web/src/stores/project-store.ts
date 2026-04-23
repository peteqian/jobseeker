import { create } from "zustand";
import type { ProjectSnapshot } from "@jobseeker/contracts";

interface ProjectStore {
  currentProject: ProjectSnapshot | null;
  setCurrentProject: (project: ProjectSnapshot | null) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),
}));
