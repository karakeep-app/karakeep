"use client";

import { createContext, useContext, useEffect } from "react";
import { ScalePreference, useDenseScale } from "@/lib/dense/useDenseScale";

interface DenseScaleValue {
  scale: number;
  preference: ScalePreference;
  setPreference: (next: ScalePreference) => void;
}

const DenseScaleCtx = createContext<DenseScaleValue | null>(null);

export function useDenseScaleContext() {
  const ctx = useContext(DenseScaleCtx);
  if (!ctx) {
    throw new Error(
      "useDenseScaleContext must be used inside DenseScaleProvider",
    );
  }
  return ctx;
}

/**
 * Publishes the dense UI's zoom factor as `--k-zoom` on <html>.
 *
 * It goes on <html> rather than the dense wrapper so that Radix portals
 * (dropdowns, dialogs) — which render into <body>, outside the wrapper —
 * scale along with everything else instead of staying at 1x.
 */
export function DenseScaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { scale, preference, setPreference } = useDenseScale();

  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty("--k-zoom", String(scale));
    return () => {
      html.style.removeProperty("--k-zoom");
    };
  }, [scale]);

  return (
    <DenseScaleCtx.Provider value={{ scale, preference, setPreference }}>
      {children}
    </DenseScaleCtx.Provider>
  );
}
