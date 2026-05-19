// reference article https://refine.dev/blog/zustand-react-state/#build-a-to-do-app-using-zustand
import { create } from "zustand";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

interface BookmarkState {
  selectedBookmarkIds: string[];
  visibleBookmarks: ZBookmark[];
  isBulkEditEnabled: boolean;
  setIsBulkEditEnabled: (isEnabled: boolean) => void;
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
      set({
        selectedBookmarkIds: selectedBookmarkIds.filter(
          (id) => id !== bookmarkId,
        ),
      });
    } else {
      set({ selectedBookmarkIds: [...selectedBookmarkIds, bookmarkId] });
    }
  },

  setSelectedBookmarkIds: (bookmarkIds: string[]) => {
    set({ selectedBookmarkIds: bookmarkIds });
  },

  selectAll: () => {
    set({ selectedBookmarkIds: get().visibleBookmarks.map((b) => b.id) });
  },
  unSelectAll: () => {
    set({ selectedBookmarkIds: [] });
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
