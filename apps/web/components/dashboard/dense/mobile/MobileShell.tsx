"use client";

import { useState } from "react";
import { QuickAddDialog } from "@/components/dashboard/dense/QuickAddDialog";

import { MobileTabBar } from "./MobileTabBar";

/**
 * Owns the mobile tab bar and its capture entry point. Mounted once in
 * `dashboard/layout.tsx`, above `{children}`, so the "+" tab works from
 * every dashboard page — including ones that don't render `DenseFilesView`
 * and therefore have no capture entry point of their own today (⌘E only
 * does anything on pages that happen to mount a `QuickAddDialog`).
 *
 * Reuses the existing `QuickAddDialog` as the capture surface for now — a
 * dedicated bottom sheet with the design's fetched-title preview and
 * +list/+tag/summarise_now chips is a separate, larger piece of work.
 */
export function MobileShell({ searchEnabled }: { searchEnabled: boolean }) {
  const [captureOpen, setCaptureOpen] = useState(false);

  return (
    <>
      <MobileTabBar
        searchEnabled={searchEnabled}
        onCapture={() => setCaptureOpen(true)}
      />
      <QuickAddDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        hotkeyEnabled={false}
      />
    </>
  );
}
