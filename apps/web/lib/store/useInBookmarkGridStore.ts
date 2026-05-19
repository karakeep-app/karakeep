import { create } from "zustand";

interface InBookmarkGridState {
  inBookmarkGrid: boolean;
  setInBookmarkGrid: (inBookmarkGrid: boolean) => void;
}

export const useInBookmarkGridStore = create<InBookmarkGridState>(
  (set, get) => ({
    inBookmarkGrid: false,
    setInBookmarkGrid: (inBookmarkGrid) => {
      if (get().inBookmarkGrid === inBookmarkGrid) {
        return;
      }
      set({ inBookmarkGrid });
    },
  }),
);
