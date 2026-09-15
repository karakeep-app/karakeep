import { create } from "zustand";

// Tracks whether a page-inline "New Item" editor card (EditorCard) is
// currently mounted, and owns the open state of the floating quick-add
// dialog that's available globally. Kept as a counter (not a boolean) so
// that briefly overlapping mounts (e.g. during route transitions) don't
// cause one unmount to incorrectly clear presence for the other.
interface QuickAddState {
  inlinePresentCount: number;
  registerInlinePresent: () => void;
  unregisterInlinePresent: () => void;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  setDialogOpen: (open: boolean) => void;
}

export const useQuickAddStore = create<QuickAddState>((set) => ({
  inlinePresentCount: 0,
  registerInlinePresent: () =>
    set((s) => ({ inlinePresentCount: s.inlinePresentCount + 1 })),
  unregisterInlinePresent: () =>
    set((s) => ({ inlinePresentCount: Math.max(0, s.inlinePresentCount - 1) })),
  dialogOpen: false,
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
  setDialogOpen: (open) => set({ dialogOpen: open }),
}));

export function useIsInlineQuickAddPresent() {
  return useQuickAddStore((s) => s.inlinePresentCount > 0);
}
