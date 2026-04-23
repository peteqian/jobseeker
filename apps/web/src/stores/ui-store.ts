import { create } from "zustand";

interface UIStore {
  error: string | null;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  error: null,
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
