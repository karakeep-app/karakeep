"use client";

import { useState } from "react";

import { MobileCaptureSheet } from "./MobileCaptureSheet";
import { MobileTabBar } from "./MobileTabBar";

/**
 * Owns the mobile tab bar and its capture entry point. Mounted once in
 * `dashboard/layout.tsx`, above `{children}`, so the "+" tab works from
 * every dashboard page — including ones that don't render `DenseFilesView`
 * and therefore have no capture entry point of their own today (⌘E only
 * does anything on pages that happen to mount a `QuickAddDialog`).
 */
export function MobileShell({ searchEnabled }: { searchEnabled: boolean }) {
  const [captureOpen, setCaptureOpen] = useState(false);

  return (
    <>
      <MobileTabBar
        searchEnabled={searchEnabled}
        onCapture={() => setCaptureOpen(true)}
      />
      <MobileCaptureSheet open={captureOpen} onOpenChange={setCaptureOpen} />
    </>
  );
}
