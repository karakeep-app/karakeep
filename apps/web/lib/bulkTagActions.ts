import { create } from "zustand";

interface TagState {
  selectedTagIds: string[];
  visibleTagIds: string[];
  isBulkEditEnabled: boolean;
  setIsBulkEditEnabled: (isEnabled: boolean) => void;
  toggleTag: (tagId: string) => void;
  setVisibleTagIds: (visibleTagIds: string[]) => void;
  selectAll: () => void;
  unSelectAll: () => void;
  isEverythingSelected: () => boolean;
  isTagSelected: (tagId: string) => boolean;
}

const useBulkTagActionsStore = create<TagState>((set, get) => ({
  selectedTagIds: [],
  visibleTagIds: [],
  isBulkEditEnabled: false,

  toggleTag: (tagId: string) => {
    const selectedTagIds = get().selectedTagIds;
    set({
      selectedTagIds: selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId],
    });
  },

  selectAll: () => {
    set({ selectedTagIds: get().visibleTagIds });
  },
  unSelectAll: () => {
    set({ selectedTagIds: [] });
  },

  isEverythingSelected: () => {
    return get().selectedTagIds.length === get().visibleTagIds.length;
  },

  setIsBulkEditEnabled: (isEnabled) => {
    set({
      isBulkEditEnabled: isEnabled,
      selectedTagIds: [],
    });
  },

  setVisibleTagIds: (visibleTagIds: string[]) => {
    set({
      visibleTagIds,
      selectedTagIds: get().selectedTagIds.filter((id) =>
        visibleTagIds.includes(id),
      ),
    });
  },
  isTagSelected: (tagId: string) => {
    return get().selectedTagIds.includes(tagId);
  },
}));

export default useBulkTagActionsStore;
