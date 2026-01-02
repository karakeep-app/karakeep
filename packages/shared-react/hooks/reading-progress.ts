"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ReadingPosition } from "@karakeep/shared/utils/reading-progress-dom";
import {
  findScrollableParent,
  getReadingPosition,
  isElementVisible,
  scrollToReadingPosition,
} from "@karakeep/shared/utils/reading-progress-dom";

import { api } from "../trpc";

// Re-export ReadingPosition type for consumers
export type { ReadingPosition };

export interface UseReadingProgressOptions {
  bookmarkId: string;
  initialOffset?: number | null;
  initialAnchor?: string | null;
  containerRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  /** Signal that content is ready for restoration */
  contentReady?: boolean;
}

export interface UseReadingProgressResult {
  /** True when content can be shown (restoration complete or not needed) */
  isReady: boolean;
}

/**
 * Tracks and syncs reading progress for a bookmark.
 * Handles scroll tracking, position restoration, and auto-save on visibility change.
 */
export function useReadingProgress(
  options: UseReadingProgressOptions,
): UseReadingProgressResult {
  const {
    bookmarkId,
    initialOffset,
    initialAnchor,
    containerRef,
    enabled = true,
    contentReady = false,
  } = options;

  const lastSavedOffset = useRef<number | null>(initialOffset ?? null);
  const apiUtils = api.useUtils();

  // Track whether restoration is complete (or not needed)
  // Ready immediately if: disabled, or no initialOffset to restore
  const needsRestoration = enabled && !!initialOffset;
  const [isReady, setIsReady] = useState(!needsRestoration);

  // Update isReady when needsRestoration changes
  // - If restoration not needed: immediately ready
  // - If restoration needed: wait for restoration to complete
  useEffect(() => {
    if (!needsRestoration) {
      setIsReady(true);
    } else {
      // Reset when we need restoration again (e.g., switching back to cached section)
      setIsReady(false);
    }
  }, [needsRestoration, bookmarkId]);

  const { mutate: updateProgress } =
    api.bookmarks.updateReadingProgress.useMutation({
      onSuccess: () => {
        apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId });
      },
      onError: (error) => {
        console.error("[ReadingProgress] Failed to save progress:", error);
      },
    });

  // Stable save function via ref to avoid effect dependency issues
  const savePosition = useCallback(
    (position: ReadingPosition) => {
      if (!enabled) return;
      if (lastSavedOffset.current === position.offset) return;

      lastSavedOffset.current = position.offset;
      updateProgress({
        bookmarkId,
        readingProgressOffset: position.offset,
        readingProgressAnchor: position.anchor,
        readingProgressPercent: position.percent,
      });
    },
    [enabled, bookmarkId, updateProgress],
  );
  const savePositionRef = useRef(savePosition);
  useEffect(() => {
    savePositionRef.current = savePosition;
  });

  // Track current reading position on scroll
  const lastKnownPositionRef = useRef<ReadingPosition | null>(
    initialOffset
      ? { offset: initialOffset, anchor: initialAnchor ?? "", percent: 0 }
      : null,
  );

  // Scroll tracking - waits for contentReady and checks visibility
  // (element may be mounted but hidden via CSS, e.g., inactive tab)
  const lastScrollTimeRef = useRef<number>(0);
  useEffect(() => {
    if (!enabled || !contentReady || typeof window === "undefined") return;

    const container = containerRef.current;
    if (!container || !isElementVisible(container)) return;

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollTimeRef.current < 150) return;
      lastScrollTimeRef.current = now;

      const position = getReadingPosition(container);
      if (position !== null && position.offset > 0) {
        lastKnownPositionRef.current = position;
      }
    };

    const foundParent = findScrollableParent(container);
    const isWindowScroll = foundParent === document.documentElement;
    const scrollParent: HTMLElement | Window = isWindowScroll
      ? window
      : foundParent;

    scrollParent.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollParent.removeEventListener("scroll", handleScroll);
    };
  }, [enabled, contentReady, containerRef]);

  // Auto-save on visibility change, beforeunload, and unmount
  // Also checks element visibility (may be hidden via CSS in inactive tab)
  useEffect(() => {
    if (!enabled || !contentReady || typeof window === "undefined") return;

    const container = containerRef.current;
    if (!container || !isElementVisible(container)) return;

    const saveCurrentProgress = () => {
      let positionToSave = lastKnownPositionRef.current;
      const freshPosition = getReadingPosition(container);
      if (freshPosition !== null && freshPosition.offset > 0) {
        positionToSave = freshPosition;
      }
      if (positionToSave !== null && positionToSave.offset > 0) {
        savePositionRef.current(positionToSave);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveCurrentProgress();
      }
    };

    const handleBeforeUnload = () => {
      saveCurrentProgress();
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      saveCurrentProgress();
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabled, contentReady, containerRef]);

  // Restore position when content is ready and visible
  useEffect(() => {
    if (!enabled || !initialOffset || !contentReady) return;

    const container = containerRef.current;
    if (!container || !isElementVisible(container)) {
      setIsReady(true);
      return;
    }

    const tryRestore = () => {
      const scrollParent = findScrollableParent(container);
      const isWindowScroll = scrollParent === document.documentElement;
      const isLayoutReady = isWindowScroll
        ? document.body.scrollHeight > window.innerHeight
        : scrollParent.scrollHeight > scrollParent.clientHeight;

      if (isLayoutReady) {
        scrollToReadingPosition(
          container,
          initialOffset,
          "instant",
          initialAnchor,
        );
        return true;
      }
      return false;
    };

    // Try immediately
    if (tryRestore()) {
      setIsReady(true);
      return;
    }

    // If layout not ready, try once more after paint
    const rafId = requestAnimationFrame(() => {
      tryRestore();
      // Mark ready regardless of success to avoid permanent hidden state
      setIsReady(true);
    });

    return () => {
      cancelAnimationFrame(rafId);
      // Always mark ready on cleanup to prevent stuck hidden state
      setIsReady(true);
    };
  }, [enabled, initialOffset, contentReady, initialAnchor, containerRef]);

  return { isReady };
}
