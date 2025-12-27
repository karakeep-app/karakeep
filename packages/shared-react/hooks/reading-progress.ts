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
  /**
   * The bookmark ID to track reading progress for
   */
  bookmarkId: string;
  /**
   * Initial reading progress offset from the bookmark data
   */
  initialOffset?: number | null;
  /**
   * Initial anchor text for position verification
   */
  initialAnchor?: string | null;
  /**
   * Ref to the container element for position tracking
   */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * Whether the feature is enabled (defaults to true)
   */
  enabled?: boolean;
  /**
   * Signal that content is ready for restoration.
   * When true, the hook will attempt to restore the reading position.
   */
  contentReady?: boolean;
}

export interface UseReadingProgressResult {
  /**
   * Whether the content is ready to be shown.
   * True when either: no restoration needed, or restoration is complete.
   * Use this to hide content until scroll position is restored to avoid flicker.
   */
  isReady: boolean;
}

/**
 * Hook for automatically tracking and syncing reading progress for a bookmark.
 * Handles scroll tracking, position restoration, and auto-save on visibility
 * change, beforeunload, and unmount.
 *
 * @returns Object with `isReady` boolean - use to hide content until restoration completes
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
  }, [needsRestoration]);

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
      ? { offset: initialOffset, anchor: initialAnchor ?? "" }
      : null,
  );

  // Scroll tracking
  const scrollParentRef = useRef<HTMLElement | Window | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollTimeRef.current < 150) return;
      lastScrollTimeRef.current = now;

      if (containerRef.current) {
        const position = getReadingPosition(containerRef.current);
        if (position !== null && position.offset > 0) {
          lastKnownPositionRef.current = position;
        }
      }
    };

    const setupScrollListener = () => {
      if (!containerRef.current) return false;
      if (!isElementVisible(containerRef.current)) return true;

      const foundParent = findScrollableParent(containerRef.current);
      const isWindowScroll = foundParent === document.documentElement;
      const scrollParent: HTMLElement | Window = isWindowScroll
        ? window
        : foundParent;

      scrollParent.addEventListener("scroll", handleScroll, { passive: true });
      scrollParentRef.current = scrollParent;
      return true;
    };

    const immediate = setupScrollListener();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    if (!immediate) {
      retryTimer = setTimeout(setupScrollListener, 300);
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (scrollParentRef.current) {
        scrollParentRef.current.removeEventListener("scroll", handleScroll);
        scrollParentRef.current = null;
      }
    };
  }, [enabled, containerRef]);

  // Auto-save on visibility change and beforeunload
  const autoSaveAttachedRef = useRef(false);
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const saveCurrentProgress = () => {
      let positionToSave = lastKnownPositionRef.current;
      if (containerRef.current) {
        const freshPosition = getReadingPosition(containerRef.current);
        if (freshPosition !== null && freshPosition.offset > 0) {
          positionToSave = freshPosition;
        }
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

    const setupAutoSave = () => {
      if (!containerRef.current) return false;
      if (!isElementVisible(containerRef.current)) return true;

      window.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("beforeunload", handleBeforeUnload);
      autoSaveAttachedRef.current = true;
      return true;
    };

    const immediate = setupAutoSave();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    if (!immediate) {
      retryTimer = setTimeout(setupAutoSave, 300);
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (autoSaveAttachedRef.current) {
        saveCurrentProgress();
        window.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("beforeunload", handleBeforeUnload);
        autoSaveAttachedRef.current = false;
      }
    };
  }, [enabled, containerRef]);

  // Restore position when content is ready
  useEffect(() => {
    if (!enabled || !initialOffset || !contentReady) return;

    const tryRestore = () => {
      const container = containerRef.current;
      if (!container || !isElementVisible(container)) return false;

      const scrollParent = findScrollableParent(container);
      const isWindowScroll = scrollParent === document.documentElement;
      const isLayoutReady =
        scrollParent &&
        (isWindowScroll
          ? document.body.scrollHeight > window.innerHeight
          : scrollParent.scrollHeight > scrollParent.clientHeight);

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
      // This handles cases where effect re-runs before RAF fires
      setIsReady(true);
    };
  }, [
    enabled,
    initialOffset,
    contentReady,
    bookmarkId,
    initialAnchor,
    containerRef,
  ]);

  return { isReady };
}
