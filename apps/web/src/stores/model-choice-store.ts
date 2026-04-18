import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ChatModelSelection } from "@jobseeker/contracts";

type ModelChoiceState = {
  hasHydrated: boolean;
  byScope: Record<string, ChatModelSelection | undefined>;
  setChoice: (scopeKey: string, selection: ChatModelSelection) => void;
  setHydrated: (value: boolean) => void;
};

export const useModelChoiceStore = create<ModelChoiceState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      byScope: {},
      setChoice: (scopeKey, selection) =>
        set((state) => ({
          byScope: {
            ...state.byScope,
            [scopeKey]: selection,
          },
        })),
      setHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "jobseeker:model-choice-store",
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({ byScope: state.byScope }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
