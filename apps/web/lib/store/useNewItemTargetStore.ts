import { create } from "zustand";

import type { ZGetBookmarksRequest } from "@karakeep/shared/types/bookmarks";

// The query of the bookmark grid on screen, when that grid accepts new
// bookmarks. The header's new item button uses it so that a bookmark created
// from there lands in the current list, tag, favourites or archive.
interface NewItemTargetState {
  query: ZGetBookmarksRequest | null;
  setQuery: (query: ZGetBookmarksRequest) => void;
  clearQuery: (query: ZGetBookmarksRequest) => void;
}

export const useNewItemTargetStore = create<NewItemTargetState>((set) => ({
  query: null,
  setQuery: (query) => set({ query }),
  // Only clears the query if it's still the one being cleared, so a grid that
  // unmounts after the next one mounted doesn't wipe out the new grid's query.
  clearQuery: (query) =>
    set((state) => (state.query === query ? { query: null } : state)),
}));
