"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The prototype is drawn on a 1000x625 frame. Its sizes are literal px, so
 * on a larger display the same design occupies a smaller fraction of the
 * screen than it does in the design tool — which reads as "everything is
 * tiny" even though every value matches spec.
 *
 * This derives a zoom factor from the viewport so the app frames the same
 * way the mockup does. Taking the *smaller* of the width and height ratios
 * (rather than width alone) preserves the 16:10 framing, so you see roughly
 * the same number of rows the mockup shows instead of a very wide, very
 * short list.
 */
export const DESIGN_WIDTH = 1000;
export const DESIGN_HEIGHT = 625;

const MIN_SCALE = 0.85;
const MAX_SCALE = 2.5;
const STORAGE_KEY = "k-dense-scale";

export type ScalePreference = "auto" | number;

export function computeAutoScale(width: number, height: number) {
  const raw = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}

function parsePreference(stored: string | null): ScalePreference {
  if (!stored || stored === "auto") return "auto";
  const parsed = Number.parseFloat(stored);
  if (!Number.isFinite(parsed)) return "auto";
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed));
}

export function useDenseScale() {
  const [preference, setPreferenceState] = useState<ScalePreference>("auto");
  // Start at 1 so the server render and first client render agree; the
  // measured value lands in the effect immediately after mount.
  const [autoScale, setAutoScale] = useState(1);

  useEffect(() => {
    setPreferenceState(
      parsePreference(window.localStorage.getItem(STORAGE_KEY)),
    );
  }, []);

  useEffect(() => {
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      setAutoScale(computeAutoScale(window.innerWidth, window.innerHeight));
    };
    const onResize = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const setPreference = useCallback((next: ScalePreference) => {
    setPreferenceState(next);
    window.localStorage.setItem(
      STORAGE_KEY,
      next === "auto" ? "auto" : String(next),
    );
  }, []);

  const scale = preference === "auto" ? autoScale : preference;

  return { scale, autoScale, preference, setPreference, MIN_SCALE, MAX_SCALE };
}
