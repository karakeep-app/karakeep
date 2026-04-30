import { create } from "zustand";

interface KeyboardNavigationState {
  focusedIndex: number;
  isNavigating: boolean;
  shortcutsDialogOpen: boolean;
  setFocusedIndex: (index: number) => void;
  clearFocus: () => void;
  moveBy: (delta: number, maxIndex: number) => void;
  setShortcutsDialogOpen: (open: boolean) => void;
}

export const useKeyboardNavigationStore = create<KeyboardNavigationState>(
  (set) => ({
    focusedIndex: -1,
    isNavigating: false,
    shortcutsDialogOpen: false,

    setFocusedIndex: (index) =>
      set({ focusedIndex: index, isNavigating: true }),

    clearFocus: () => set({ focusedIndex: -1, isNavigating: false }),

    moveBy: (delta, maxIndex) =>
      set((state) => {
        if (maxIndex < 0) return state;
        if (!state.isNavigating) return { focusedIndex: 0, isNavigating: true };
        const next = Math.max(
          0,
          Math.min(state.focusedIndex + delta, maxIndex),
        );
        return { focusedIndex: next, isNavigating: true };
      }),

    setShortcutsDialogOpen: (open) => set({ shortcutsDialogOpen: open }),
  }),
);
