"use client";

import { createContext, useContext } from "react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import type { PreviewNavigation } from "./usePreviewNavigation";

/** View choices that stay put while moving between bookmarks. */
export interface PreviewViewState {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

interface PreviewDialog {
  /** The grid's copy of the bookmark, shown while the full one loads. */
  placeholder?: ZBookmark;
  navigation?: PreviewNavigation;
  view: PreviewViewState;
  close: () => void;
}

/**
 * Provided by the preview dialog's layout, which stays mounted while the page
 * under it changes from one bookmark to the next.
 */
export const PreviewDialogContext = createContext<PreviewDialog | null>(null);

export function usePreviewDialog() {
  const dialog = useContext(PreviewDialogContext);
  if (!dialog) {
    throw new Error("usePreviewDialog must be used inside the preview dialog");
  }
  return dialog;
}
