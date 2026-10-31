import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ZSortOrder } from "@karakeep/shared/types/bookmarks";

type DefaultSortOrder = Exclude<ZSortOrder, "relevance">;

interface SortOrderState {
  sortOrder: ZSortOrder;
  defaultSortOrder: DefaultSortOrder;
  setSortOrder: (sortOrder: ZSortOrder) => void;
}

type PersistedSortOrderState = Pick<SortOrderState, "defaultSortOrder">;

export const useSortOrderStore = create<SortOrderState>()(
  persist<SortOrderState, [], [], PersistedSortOrderState>(
    (set) => ({
      sortOrder: "desc",
      defaultSortOrder: "desc",
      setSortOrder: (sortOrder) =>
        set((state) => ({
          sortOrder,
          // "relevance" is search-only, so keep the last concrete choice as the user's preferred sort order.
          defaultSortOrder:
            sortOrder === "relevance" ? state.defaultSortOrder : sortOrder,
        })),
    }),
    {
      name: "karakeep-sort-order",
      partialize: (state) => ({ defaultSortOrder: state.defaultSortOrder }),
      merge: (persisted, current) => {
        const persistedState = persisted as
          | Partial<PersistedSortOrderState>
          | undefined;
        const defaultSortOrder =
          persistedState?.defaultSortOrder ?? current.defaultSortOrder;
        return {
          ...current,
          defaultSortOrder,
          sortOrder: defaultSortOrder,
        };
      },
    },
  ),
);
