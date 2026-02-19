import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { ReadingPosition } from "@karakeep/shared/utils/reading-progress-dom";
import {
  findScrollableParent,
  getReadingPosition,
  SCROLL_THROTTLE_MS,
  scrollToReadingPosition,
} from "@karakeep/shared/utils/reading-progress-dom";

interface ScrollProgressTrackerProps {
  onScrollProgress?: (position: ReadingPosition) => void;
  /** When set to true, scrolls to the saved reading position */
  restorePosition?: boolean;
  readingProgressOffset?: number | null;
  readingProgressAnchor?: string | null;
  /** Show a Medium-style reading progress bar at the top */
  showProgressBar?: boolean;
  /** Custom styles for the progress bar container (e.g. positioning overrides) */
  progressBarStyle?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * Wraps content and tracks scroll progress, reporting position changes
 * on scroll (throttled), visibility change, beforeunload, and unmount.
 * Can also restore a previously saved reading position.
 */
const ScrollProgressTracker = forwardRef<
  HTMLDivElement,
  ScrollProgressTrackerProps
>(function ScrollProgressTracker(
  {
    onScrollProgress,
    restorePosition,
    readingProgressOffset,
    readingProgressAnchor,
    showProgressBar,
    progressBarStyle,
    children,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => containerRef.current!, []);
  const [scrollPercent, setScrollPercent] = useState(0);

  const onScrollProgressRef = useRef(onScrollProgress);
  useEffect(() => {
    onScrollProgressRef.current = onScrollProgress;
  });

  // Restore reading position when triggered
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (
      !restorePosition ||
      hasRestoredRef.current ||
      !readingProgressOffset ||
      readingProgressOffset <= 0
    )
      return;

    hasRestoredRef.current = true;
    const rafId = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      scrollToReadingPosition(
        container,
        readingProgressOffset,
        "smooth",
        readingProgressAnchor,
      );
    });

    return () => cancelAnimationFrame(rafId);
  }, [restorePosition, readingProgressOffset, readingProgressAnchor]);

  // Scroll tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastScrollTime = 0;

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollTime < SCROLL_THROTTLE_MS) return;
      lastScrollTime = now;

      const position = getReadingPosition(container);
      if (position) {
        setScrollPercent(position.percent);
        if (onScrollProgressRef.current) {
          onScrollProgressRef.current(position);
        }
      }
    };

    const scrollParent = findScrollableParent(container);
    const isWindowScroll = scrollParent === document.documentElement;
    const target: HTMLElement | Window = isWindowScroll ? window : scrollParent;

    target.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      target.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Report position on visibility change, beforeunload, and unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reportPosition = () => {
      const position = getReadingPosition(container);
      if (position && position.offset > 0 && onScrollProgressRef.current) {
        onScrollProgressRef.current(position);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        reportPosition();
      }
    };

    const handleBeforeUnload = () => {
      reportPosition();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      reportPosition();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return (
    <div ref={containerRef}>
      {showProgressBar && (
        <div
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 50,
            backgroundColor: "rgba(0,0,0,0.1)",
            ...progressBarStyle,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${scrollPercent}%`,
              backgroundColor: "rgb(249, 115, 22)",
              transition: "width 150ms ease-out",
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
});

export default ScrollProgressTracker;
