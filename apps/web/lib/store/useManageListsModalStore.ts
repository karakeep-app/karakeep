import { create } from "zustand";

// Holds which bookmark's "Manage Lists" dialog is currently open, if any.
//
// This is intentionally global (instead of local component state) because
// the dialog is rendered from a single, stable place (see BookmarksGrid),
// while the button that opens it lives inside a per-bookmark card that can
// be unmounted mid-interaction (e.g. removing a bookmark's last list while
// viewing that list removes the bookmark from the grid). Keeping the open
// state here means the dialog survives that unmount instead of closing
// itself. See https://github.com/karakeep-app/karakeep/issues/2963.
interface ManageListsModalState {
  bookmarkId: string | null;
  setBookmarkId: (bookmarkId: string | null) => void;
}

export const useManageListsModalStore = create<ManageListsModalState>(
  (set) => ({
    bookmarkId: null,
    setBookmarkId: (bookmarkId) => set({ bookmarkId }),
  }),
);
