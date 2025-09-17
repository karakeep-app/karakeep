import { create } from "zustand";

interface InBookmarkGridState {
  inBookmarkGrid: boolean;
  setInBookmarkGrid: (inBookmarkGrid: boolean) => void;
}

export const useInBookmarkGridStore = create<InBookmarkGridState>((set) => ({
  inBookmarkGrid: false,
  setInBookmarkGrid: (inBookmarkGrid) => set({ inBookmarkGrid }),
}));
