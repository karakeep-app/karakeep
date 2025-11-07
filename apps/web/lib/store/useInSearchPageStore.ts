import { create } from "zustand";

interface InSearchPageState {
  inSearchPage: boolean;
  setInSearchPage: (inSearchPage: boolean) => void;
}

export const useInSearchPageStore = create<InSearchPageState>((set) => ({
  inSearchPage: false,
  setInSearchPage: (inSearchPage) => {
    set({ inSearchPage });
  },
}));
