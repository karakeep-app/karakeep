"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ReadingPosition } from "@karakeep/shared/utils/reading-progress-dom";
import {
  findScrollableParent,
  getReadingPosition,
  scrollToReadingPosition,
} from "@karakeep/shared/utils/reading-progress-dom";

import { api } from "../trpc";

/**
 * Module-level lock to prevent concurrent restoration attempts.
 * Maps bookmarkId -> timestamp when restoration was claimed.
 * This handles both StrictMode double-mounting AND multiple component instances.
 */
const restorationClaimed = new Map<string, number>();

/**
 * Try to claim restoration for a bookmark. Returns true if we got the claim.
 * Claims expire after 5 seconds to handle edge cases (reduced from 10s for faster re-open).
 */
function claimRestoration(bookmarkId: string): boolean {
  const existing = restorationClaimed.get(bookmarkId);
  const now = Date.now();

  // Clean up expired claims (5 seconds should be plenty for restoration to complete)
  if (existing && now - existing > 5000) {
    restorationClaimed.delete(bookmarkId);
  }

  if (restorationClaimed.has(bookmarkId)) {
    return false;
  }

  restorationClaimed.set(bookmarkId, now);
  return true;
}

/**
 * Release a restoration claim (called on cleanup if we never actually restored).
 */
function releaseRestoration(bookmarkId: string): void {
  restorationClaimed.delete(bookmarkId);
}

/**
 * Check if element is visible (not hidden by CSS display:none).
 * Uses bounding rect - hidden elements have 0 dimensions.
 * We use this instead of offsetParent because the dialog uses position:fixed,
 * which makes offsetParent null even for visible elements.
 */
function isElementVisible(element: HTMLElement | null): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

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
   * Whether the feature is enabled (defaults to true)
   */
  enabled?: boolean;
}

export interface UseReadingProgressResult {
  /**
   * Current tracked reading position offset
   */
  currentOffset: number | null;
  /**
   * Whether the position is being saved
   */
  isSaving: boolean;
  /**
   * Get the current reading position from the container
   */
  capturePosition: (container: HTMLElement) => ReadingPosition | null;
  /**
   * Scroll to the saved reading position
   */
  restorePosition: (
    container: HTMLElement,
    behavior?: ScrollBehavior,
  ) => boolean;
  /**
   * Save the current position to the server
   */
  saveProgress: (container: HTMLElement) => void;
  /**
   * Manually save a specific position (offset and anchor)
   */
  savePosition: (position: ReadingPosition) => void;
}

/**
 * Hook for tracking and syncing reading progress for a bookmark.
 *
 * Usage:
 * 1. Call the hook with the bookmarkId and initial offset/anchor
 * 2. On mount, call restorePosition() to scroll to saved position
 * 3. On unmount/visibility change, call saveProgress() to persist position
 */
export function useReadingProgress(
  options: UseReadingProgressOptions,
): UseReadingProgressResult {
  const { bookmarkId, initialOffset, initialAnchor, enabled = true } = options;

  const [currentOffset, setCurrentOffset] = useState<number | null>(
    initialOffset ?? null,
  );
  const lastSavedOffset = useRef<number | null>(initialOffset ?? null);

  const apiUtils = api.useUtils();

  const { mutate: updateProgress, isPending: isSaving } =
    api.bookmarks.updateReadingProgress.useMutation({
      onSuccess: () => {
        // Invalidate bookmark queries to ensure UI reflects saved progress
        apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId });
      },
    });

  const capturePosition = useCallback((container: HTMLElement) => {
    const position = getReadingPosition(container);
    if (position !== null) {
      setCurrentOffset(position.offset);
    }
    return position;
  }, []);

  const restorePosition = useCallback(
    (container: HTMLElement, behavior: ScrollBehavior = "smooth") => {
      if (initialOffset && initialOffset > 0) {
        return scrollToReadingPosition(
          container,
          initialOffset,
          behavior,
          initialAnchor,
        );
      }
      return false;
    },
    [initialOffset, initialAnchor],
  );

  const savePosition = useCallback(
    (position: ReadingPosition) => {
      if (!enabled) return;

      // Only save if offset has meaningfully changed (>100 chars difference)
      if (
        lastSavedOffset.current === null ||
        Math.abs(position.offset - lastSavedOffset.current) > 100
      ) {
        lastSavedOffset.current = position.offset;
        updateProgress({
          bookmarkId,
          readingProgressOffset: position.offset,
          readingProgressAnchor: position.anchor,
        });
      }
    },
    [enabled, bookmarkId, updateProgress],
  );

  const saveProgress = useCallback(
    (container: HTMLElement) => {
      if (!enabled) return;

      const position = getReadingPosition(container);
      if (position !== null && position.offset > 0) {
        savePosition(position);
      }
    },
    [enabled, savePosition],
  );

  return {
    currentOffset,
    isSaving,
    capturePosition,
    restorePosition,
    saveProgress,
    savePosition,
  };
}

/**
 * Hook that automatically manages reading progress lifecycle events.
 * Handles beforeunload, visibilitychange on web, and provides AppState
 * integration point for mobile.
 */
export function useReadingProgressAutoSave(
  options: UseReadingProgressOptions & {
    containerRef: React.RefObject<HTMLElement | null>;
  },
) {
  const progress = useReadingProgress(options);
  const { containerRef, enabled = true } = options;

  // Store progress functions in refs to avoid effect dependency issues
  const savePositionRef = useRef(progress.savePosition);
  const restorePositionRef = useRef(progress.restorePosition);
  useEffect(() => {
    savePositionRef.current = progress.savePosition;
    restorePositionRef.current = progress.restorePosition;
  });

  // Track current reading position on scroll (offset + anchor)
  const lastKnownPositionRef = useRef<ReadingPosition | null>(
    options.initialOffset
      ? { offset: options.initialOffset, anchor: options.initialAnchor ?? "" }
      : null,
  );

  // Update reading position on scroll
  // Store reference to scroll parent for cleanup
  const scrollParentRef = useRef<HTMLElement | Window | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const handleScroll = () => {
      if (containerRef.current) {
        const position = getReadingPosition(containerRef.current);
        if (position !== null && position.offset > 0) {
          lastKnownPositionRef.current = position;
        }
      }
    };

    // Find the scrollable parent - could be a ScrollArea viewport or the window
    const setupScrollListener = () => {
      if (!containerRef.current) {
        return false;
      }

      // Skip if container is in a hidden layout (e.g., CSS display:none)
      if (!isElementVisible(containerRef.current)) {
        return true; // Return true to prevent retry - hidden containers stay hidden
      }

      // Find the nearest scrollable ancestor using shared function
      const foundParent = findScrollableParent(containerRef.current);
      const isWindowScroll = foundParent === document.documentElement;
      const scrollParent: HTMLElement | Window = isWindowScroll
        ? window
        : foundParent;

      scrollParent.addEventListener("scroll", handleScroll, { passive: true });
      scrollParentRef.current = scrollParent;

      return true;
    };

    // Try to set up immediately
    const immediate = setupScrollListener();

    // Retry after a delay if container not ready
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    if (!immediate) {
      retryTimer = setTimeout(() => {
        setupScrollListener();
      }, 300);
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (scrollParentRef.current) {
        scrollParentRef.current.removeEventListener("scroll", handleScroll);
        scrollParentRef.current = null;
      }
    };
  }, [enabled, containerRef]);

  // Track if autoSave listeners are attached for this instance
  const autoSaveAttachedRef = useRef(false);

  // Set up auto-save on visibility change and beforeunload (web only)
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const saveCurrentProgress = () => {
      // First try to get fresh position if container is available
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

    // Setup function that waits for container to be ready and visible
    const setupAutoSave = () => {
      if (!containerRef.current) {
        return false;
      }

      // Skip if container is in a hidden layout (e.g., CSS display:none)
      if (!isElementVisible(containerRef.current)) {
        return true; // Return true to prevent retry - hidden containers stay hidden
      }

      window.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("beforeunload", handleBeforeUnload);
      autoSaveAttachedRef.current = true;
      return true;
    };

    // Try to set up immediately
    const immediate = setupAutoSave();

    // Retry after a delay if container not ready
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    if (!immediate) {
      retryTimer = setTimeout(() => {
        setupAutoSave();
      }, 300);
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (autoSaveAttachedRef.current) {
        // Save on unmount
        saveCurrentProgress();
        window.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("beforeunload", handleBeforeUnload);
        autoSaveAttachedRef.current = false;
      }
    };
  }, [enabled, containerRef]);

  // Restore position on mount - use requestAnimationFrame for reliability
  // Track whether THIS instance successfully restored (for cleanup purposes)
  const didRestoreRef = useRef(false);
  // Track whether THIS instance claimed the lock (for cleanup purposes)
  const hasLockRef = useRef(false);

  useEffect(() => {
    if (!enabled || !options.initialOffset) {
      return;
    }

    // Use an object for per-effect-instance cancellation
    const state = { cancelled: false };

    // Container not ready, use RAF polling to wait for layout
    let attempts = 0;
    const maxAttempts = 120; // ~2 seconds at 60fps

    const tryRestore = () => {
      if (state.cancelled) {
        return;
      }

      attempts++;
      const container = containerRef.current;

      // Skip if container is in a hidden layout (e.g., CSS display:none)
      // Check this BEFORE claiming the lock so hidden instances never block visible ones
      if (container && !isElementVisible(container)) {
        return; // Stop trying - hidden containers stay hidden
      }

      // Check if container exists AND has a scrollable parent with content
      // This ensures the layout is complete before we try to scroll
      const scrollParent = container ? findScrollableParent(container) : null;
      const isWindowScroll = scrollParent === document.documentElement;
      // For window scrolling, check document body has content; for container, check container
      const isLayoutReady =
        scrollParent &&
        (isWindowScroll
          ? document.body.scrollHeight > window.innerHeight
          : scrollParent.scrollHeight > scrollParent.clientHeight);

      if (container && isLayoutReady) {
        // Now try to claim the lock - only when we're ready to restore
        // This handles both StrictMode double-mounting AND multiple component instances.
        if (!hasLockRef.current && !claimRestoration(options.bookmarkId)) {
          return; // Someone else already restored
        }
        hasLockRef.current = true;

        restorePositionRef.current(container, "instant");
        didRestoreRef.current = true;
        // Keep the lock - we successfully restored
        return; // Done
      }

      if (attempts < maxAttempts) {
        requestAnimationFrame(tryRestore);
      }
    };

    // Start the animation frame loop
    requestAnimationFrame(tryRestore);

    return () => {
      state.cancelled = true;
      // Release lock if we claimed it - this allows reopening the preview to work
      // The lock's purpose is to prevent concurrent restoration during mount,
      // not to prevent restoration on subsequent opens
      if (hasLockRef.current) {
        releaseRestoration(options.bookmarkId);
        hasLockRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, options.initialOffset, options.bookmarkId]);

  return progress;
}
