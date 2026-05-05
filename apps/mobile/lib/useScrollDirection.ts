import { useCallback, useRef, useState } from "react";

const HIDE_THRESHOLD = 15; // px scrolled down before hiding bars
const TOP_THRESHOLD = 5; // px from top where bars are always visible

/**
 * Tracks scroll direction to determine whether header/footer bars
 * should be visible. Scrolling down hides bars, scrolling up shows them.
 * Bars are always visible when near the top of the content.
 */
export function useScrollDirection() {
  const [barsVisible, setBarsVisible] = useState(true);
  const barsVisibleRef = useRef(true);
  const lastOffsetRef = useRef(0);
  const accumulatedRef = useRef(0);

  const onScrollOffsetChange = useCallback((y: number) => {
    // Avoid setState on every scroll tick — the ref check skips redundant
    // commits that would otherwise re-run consuming effects (e.g. the screen's
    // navigation.setOptions header toggle) per pixel.
    const setBars = (next: boolean) => {
      if (barsVisibleRef.current === next) return;
      barsVisibleRef.current = next;
      setBarsVisible(next);
    };

    const lastOffset = lastOffsetRef.current;
    const delta = y - lastOffset;
    lastOffsetRef.current = y;

    // Always show bars near the top
    if (y < TOP_THRESHOLD) {
      accumulatedRef.current = 0;
      setBars(true);
      return;
    }

    if (delta > 0) {
      // Scrolling down — accumulate distance
      accumulatedRef.current += delta;
      if (accumulatedRef.current > HIDE_THRESHOLD) {
        setBars(false);
      }
    } else if (delta < 0) {
      // Scrolling up — show immediately
      accumulatedRef.current = 0;
      setBars(true);
    }
  }, []);

  return { barsVisible, onScrollOffsetChange };
}
