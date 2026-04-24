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
  const lastOffsetRef = useRef(0);
  const accumulatedRef = useRef(0);

  const onScrollOffsetChange = useCallback((y: number) => {
    const lastOffset = lastOffsetRef.current;
    const delta = y - lastOffset;
    lastOffsetRef.current = y;

    // Always show bars near the top
    if (y < TOP_THRESHOLD) {
      accumulatedRef.current = 0;
      setBarsVisible(true);
      return;
    }

    if (delta > 0) {
      // Scrolling down — accumulate distance
      accumulatedRef.current = Math.max(0, accumulatedRef.current + delta);
      if (accumulatedRef.current > HIDE_THRESHOLD) {
        setBarsVisible(false);
      }
    } else if (delta < 0) {
      // Scrolling up — show immediately
      accumulatedRef.current = 0;
      setBarsVisible(true);
    }
  }, []);

  return { barsVisible, onScrollOffsetChange };
}
