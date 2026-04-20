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

/** Delay after the last scroll event before reporting position (milliseconds) */
const IDLE_SAVE_DELAY_MS = 5000;

/** Delay after the last scroll event before hiding the progress bar (milliseconds) */
const PROGRESS_BAR_HIDE_DELAY_MS = 2000;

interface ScrollProgressTrackerProps {
  /** Called lazily on intent signals (idle, visibility change, beforeunload, unmount) — use for persisting position */
  onSavePosition?: (position: ReadingPosition) => void;
  /** Called on every throttled scroll — use for responsive UI (banner dismissal, etc.) */
  onScrollPositionChange?: (position: ReadingPosition) => void;
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
 * lazily (idle after scrolling, visibility change, beforeunload, unmount).
 * Can also restore a previously saved reading position.
 */
const ScrollProgressTracker = forwardRef<
  HTMLDivElement,
  ScrollProgressTrackerProps
>(function ScrollProgressTracker(
  {
    onSavePosition,
    onScrollPositionChange,
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
  const [progressBarVisible, setProgressBarVisible] = useState(false);
  const latestPositionRef = useRef<ReadingPosition | null>(null);

  const onSavePositionRef = useRef(onSavePosition);
  const onScrollPositionChangeRef = useRef(onScrollPositionChange);
  useEffect(() => {
    onSavePositionRef.current = onSavePosition;
    onScrollPositionChangeRef.current = onScrollPositionChange;
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

  // Scroll tracking — updates the progress bar on every scroll,
  // but only reports position lazily via an idle timer.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastScrollTime = 0;
    let idleTimerId: ReturnType<typeof setTimeout> | null = null;
    let hideBarTimerId: ReturnType<typeof setTimeout> | null = null;
    let trailingTimerId: ReturnType<typeof setTimeout> | null = null;

    const reportLatestPosition = () => {
      const pos = latestPositionRef.current;
      if (pos && pos.offset > 0 && onSavePositionRef.current) {
        onSavePositionRef.current(pos);
      }
    };

    const processScroll = () => {
      lastScrollTime = Date.now();

      const position = getReadingPosition(container);
      if (position) {
        setScrollPercent(position.percent);
        latestPositionRef.current = position;
        if (onScrollPositionChangeRef.current) {
          onScrollPositionChangeRef.current(position);
        }
      }

      // Show progress bar on scroll, hide after idle
      setProgressBarVisible(true);
      if (hideBarTimerId) clearTimeout(hideBarTimerId);
      hideBarTimerId = setTimeout(
        () => setProgressBarVisible(false),
        PROGRESS_BAR_HIDE_DELAY_MS,
      );

      // Reset idle timer — report position after scrolling stops
      if (idleTimerId) clearTimeout(idleTimerId);
      idleTimerId = setTimeout(reportLatestPosition, IDLE_SAVE_DELAY_MS);
    };

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollTime < SCROLL_THROTTLE_MS) {
        // Schedule a trailing call so the last scroll event is never lost
        if (!trailingTimerId) {
          trailingTimerId = setTimeout(() => {
            trailingTimerId = null;
            processScroll();
          }, SCROLL_THROTTLE_MS);
        }
        return;
      }
      processScroll();
    };

    const scrollParent = findScrollableParent(container);
    const isWindowScroll = scrollParent === document.documentElement;
    const target: HTMLElement | Window = isWindowScroll ? window : scrollParent;

    target.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      target.removeEventListener("scroll", handleScroll);
      if (idleTimerId) clearTimeout(idleTimerId);
      if (hideBarTimerId) clearTimeout(hideBarTimerId);
      if (trailingTimerId) clearTimeout(trailingTimerId);
    };
  }, []);

  // Report position on visibility change, beforeunload, and unmount
  useEffect(() => {
    const reportPosition = () => {
      const pos = latestPositionRef.current;
      if (pos && pos.offset > 0 && onSavePositionRef.current) {
        onSavePositionRef.current(pos);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        reportPosition();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", reportPosition);

    return () => {
      reportPosition();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", reportPosition);
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
            backgroundColor: "transparent",
            opacity: progressBarVisible ? 1 : 0,
            transition: "opacity 300ms ease-out",
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
