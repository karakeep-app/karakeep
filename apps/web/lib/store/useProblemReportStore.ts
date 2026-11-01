import { create } from "zustand";

interface ProblemReportState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useProblemReportStore = create<ProblemReportState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
