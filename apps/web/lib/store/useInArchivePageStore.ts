import { create } from "zustand";

interface InArchivePageState {
  inArchivePage: boolean;
  setInArchivePage: (inArchivePage: boolean) => void;
}

export const useInArchivePageStore = create<InArchivePageState>((set) => ({
  inArchivePage: false,
  setInArchivePage: (inArchivePage) => {
    set({ inArchivePage });
  },
}));
