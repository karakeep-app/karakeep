"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The prototype is drawn on a 1000x625 frame. Its px values are literal, so
 * on a viewport smaller than that frame the design would be clipped —
 * `computeAutoScale` scales *down* to fit in that case.
 *
 * It used to also scale *up* past 1x on anything bigger, uncapped, to make
 * the design "occupy the same fraction of the screen it does in the design
 * tool". In practice that meant a real ~2560x1440 monitor computed a 2.3x
 * factor — every control, not just text, rendered at 2.3x its designed
 * size, and a Save button at that scale reads as broken, not "bigger": the
 * padding/border-radius/height ratios that look right at 1x don't hold up
 * blown up uniformly, so the button dominates the dialog instead of
 * sitting in proportion with it. Reported directly against a real external
 * monitor, not a guess. AUTO_MAX_SCALE keeps automatic scaling to fitting
 * *down*, never up past the design's own sizes — the manual +/- control in
 * the header's Scale menu still goes up to MAX_SCALE for anyone who wants
 * larger UI on purpose (that's a size preference, not a viewport-fit bug).
 */
const DESIGN_WIDTH = 1000;
const DESIGN_HEIGHT = 625;

export const MIN_SCALE = 0.85;
export const MAX_SCALE = 2.5;
const AUTO_MAX_SCALE = 1;
const STORAGE_KEY = "k-dense-scale";

export type ScalePreference = "auto" | number;

export function computeAutoScale(width: number, height: number) {
  const raw = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  return Math.min(AUTO_MAX_SCALE, Math.max(MIN_SCALE, raw));
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

  return { scale, preference, setPreference };
}
