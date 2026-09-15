import { create } from "zustand";
import { persist } from "zustand/middleware";

// Per-device UI preference only (not data that needs to sync across
// devices), so localStorage via zustand's persist middleware is enough -
// no server-side storage needed.
interface SidebarCollapsedState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarCollapsed = create<SidebarCollapsedState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    {
      name: "karakeep:sidebar-collapsed",
    },
  ),
);
