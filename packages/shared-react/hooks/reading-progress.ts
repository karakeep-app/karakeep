"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ReadingPosition } from "@karakeep/shared/utils/reading-progress-dom";
import {
  findScrollableParent,
  getReadingPosition,
  isElementVisible,
  SCROLL_THROTTLE_MS,
  scrollToReadingPosition,
} from "@karakeep/shared/utils/reading-progress-dom";

import { useTRPC } from "../trpc";

// Re-export ReadingPosition type for consumers
export type { ReadingPosition };

export interface UseReadingProgressOptions {
  bookmarkId: string;
  initialOffset?: number | null;
  initialAnchor?: string | null;
  containerRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  /** Signal that content is ready for scroll tracking */
  contentReady?: boolean;
}

export interface UseReadingProgressResult {
  /** True when there is a saved position the user can scroll to */
  hasSavedPosition: boolean;
  /** Scroll to the saved reading position */
  scrollToSavedPosition: () => void;
  /** Dismiss the saved position banner without scrolling */
  dismissSavedPosition: () => void;
}

/**
 * Tracks and syncs reading progress for a bookmark.
 * Handles scroll tracking and auto-save on visibility change.
 * Returns banner state for saved position restoration (user-triggered).
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
  const api = useTRPC();
  const queryClient = useQueryClient();

  // Track whether the saved position banner has been dismissed or used
  const [savedPositionDismissed, setSavedPositionDismissed] = useState(false);
  const hasSavedPosition =
    enabled && !!initialOffset && initialOffset > 0 && !savedPositionDismissed;

  // Reset dismissed state when bookmark changes
  useEffect(() => {
    setSavedPositionDismissed(false);
  }, [bookmarkId]);

  const scrollToSavedPosition = useCallback(() => {
    const container = containerRef.current;
    if (container && initialOffset) {
      scrollToReadingPosition(
        container,
        initialOffset,
        "smooth",
        initialAnchor,
      );
    }
    setSavedPositionDismissed(true);
  }, [containerRef, initialOffset, initialAnchor]);

  const dismissSavedPosition = useCallback(() => {
    setSavedPositionDismissed(true);
  }, []);

  const { mutate: updateProgress } = useMutation(
    api.bookmarks.updateReadingProgress.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(api.bookmarks.getBookmark.pathFilter());
      },
      onError: (error: unknown) => {
        console.error("[ReadingProgress] Failed to save progress:", error);
      },
    }),
  );

  // Save function stored in a ref for stable access from event handlers.
  // Why this pattern? Effects below subscribe to visibilitychange/beforeunload and
  // need to call savePosition. If we used savePosition directly in those effects:
  //   - Adding it to deps → re-subscribes to events when bookmarkId changes (wasteful)
  //   - Omitting from deps → stale closure captures old bookmarkId (bug)
  // The ref lets event handlers always access the latest function without re-subscribing.
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
  const savePositionCallbackRef = useRef(savePosition);
  useEffect(() => {
    savePositionCallbackRef.current = savePosition;
  });

  // Scroll tracking - waits for contentReady and checks visibility
  // (element may be mounted but hidden via CSS, e.g., inactive tab)
  const lastScrollTimeRef = useRef<number>(0);
  useEffect(() => {
    if (!enabled || !contentReady || typeof window === "undefined") return;

    const container = containerRef.current;
    if (!container || !isElementVisible(container)) return;

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollTimeRef.current < SCROLL_THROTTLE_MS) return;
      lastScrollTimeRef.current = now;
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
      const position = getReadingPosition(container);
      if (position !== null && position.offset > 0) {
        savePositionCallbackRef.current(position);
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

  return { hasSavedPosition, scrollToSavedPosition, dismissSavedPosition };
}
