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
  setVisibleBookmarks: (visibleBookmarks: ZBookmark[]) => void;
  selectAll: () => void;
  unSelectAll: () => void;
  isEverythingSelected: () => boolean;
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

  selectAll: () => {
    set({ selectedBookmarkIds: get().visibleBookmarks.map((b) => b.id) });
  },
  unSelectAll: () => {
    set({ selectedBookmarkIds: [] });
  },

  isEverythingSelected: () => {
    return get().selectedBookmarkIds.length === get().visibleBookmarks.length;
  },

  setIsBulkEditEnabled: (isEnabled) => {
    set({ isBulkEditEnabled: isEnabled });
    set({ selectedBookmarkIds: [] });
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
