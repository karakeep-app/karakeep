import { create } from "zustand";

import { ZSortOrder } from "@karakeep/shared/types/bookmarks";

interface SortOrderState {
  // null means "no override", so consumers fall back to the server-provided
  // default from the user local settings cookie.
  sortOrder: ZSortOrder | null;
  setSortOrder: (sortOrder: ZSortOrder | null) => void;
}

export const useSortOrderStore = create<SortOrderState>((set) => ({
  sortOrder: null,
  setSortOrder: (sortOrder) => set({ sortOrder }),
}));
