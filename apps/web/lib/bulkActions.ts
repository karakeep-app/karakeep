// reference article https://refine.dev/blog/zustand-react-state/#build-a-to-do-app-using-zustand
import { create } from "zustand";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

interface BookmarkState {
  selectedBookmarkIds: string[];
  visibleBookmarks: ZBookmark[];
  isBulkEditEnabled: boolean;
  setIsBulkEditEnabled: (isEnabled: boolean) => void;
  enableBulkEditForBookmark: (bookmarkId: string) => void;
  toggleBookmark: (bookmarkId: string) => void;
  setSelectedBookmarkIds: (bookmarkIds: string[]) => void;
  setVisibleBookmarks: (visibleBookmarks: ZBookmark[]) => void;
  selectAll: () => void;
  unSelectAll: () => void;
  isBookmarkSelected: (bookmarkId: string) => boolean;
  isEverythingSelected: () => boolean;
  getSelectedBookmarks: () => ZBookmark[];
  getSelectedActionableBookmarks: (
    canActOnBookmark: (bookmark: ZBookmark) => boolean,
  ) => ZBookmark[];
  setListContext: (listContext: ZBookmarkList | undefined) => void;
  listContext: ZBookmarkList | undefined;
}

const useBulkActionsStore = create<BookmarkState>((set, get) => ({
  selectedBookmarkIds: [],
  visibleBookmarks: [],
  isBulkEditEnabled: false,
  listContext: undefined,

  toggleBookmark: (bookmarkId: string) => {
    const selectedBookmarkIds = get().selectedBookmarkIds;
    const isBookmarkAlreadySelected = selectedBookmarkIds.includes(bookmarkId);
    if (isBookmarkAlreadySelected) {
      const remainingBookmarkIds = selectedBookmarkIds.filter(
        (id) => id !== bookmarkId,
      );
      set({
        selectedBookmarkIds: remainingBookmarkIds,
        isBulkEditEnabled: remainingBookmarkIds.length > 0,
      });
    } else {
      set({ selectedBookmarkIds: [...selectedBookmarkIds, bookmarkId] });
    }
  },

  setSelectedBookmarkIds: (bookmarkIds: string[]) => {
    set({
      selectedBookmarkIds: bookmarkIds,
      ...(bookmarkIds.length === 0 && { isBulkEditEnabled: false }),
    });
  },

  selectAll: () => {
    set({ selectedBookmarkIds: get().visibleBookmarks.map((b) => b.id) });
  },
  unSelectAll: () => {
    set({ selectedBookmarkIds: [], isBulkEditEnabled: false });
  },

  isBookmarkSelected: (bookmarkId: string) => {
    return get().selectedBookmarkIds.includes(bookmarkId);
  },

  isEverythingSelected: () => {
    const { selectedBookmarkIds, visibleBookmarks } = get();
    if (visibleBookmarks.length === 0) {
      return false;
    }
    const selected = new Set(selectedBookmarkIds);
    return visibleBookmarks.every((bookmark) => selected.has(bookmark.id));
  },

  getSelectedBookmarks: () => {
    const { selectedBookmarkIds, visibleBookmarks } = get();
    const selected = new Set(selectedBookmarkIds);
    return visibleBookmarks.filter((bookmark) => selected.has(bookmark.id));
  },

  getSelectedActionableBookmarks: (canActOnBookmark) => {
    return get().getSelectedBookmarks().filter(canActOnBookmark);
  },

  setIsBulkEditEnabled: (isEnabled) => {
    const state = get();
    if (state.isBulkEditEnabled === isEnabled) {
      return;
    }
    set({ isBulkEditEnabled: isEnabled, selectedBookmarkIds: [] });
  },
  enableBulkEditForBookmark: (bookmarkId) => {
    set({ isBulkEditEnabled: true, selectedBookmarkIds: [bookmarkId] });
  },

  setVisibleBookmarks: (visibleBookmarks: ZBookmark[]) => {
    set({
      visibleBookmarks,
    });
  },
  setListContext: (listContext: ZBookmarkList | undefined) => {
    set({ listContext });
  },
}));

export default useBulkActionsStore;
