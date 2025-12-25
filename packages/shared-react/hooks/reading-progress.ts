"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../trpc";

/**
 * Calculates the text offset of the first visible paragraph within a container.
 * Uses IntersectionObserver to find visible paragraphs and TreeWalker to calculate offsets.
 */
export function getReadingPosition(container: HTMLElement): number | null {
  // Find all paragraph-like elements
  const paragraphs = container.querySelectorAll(
    "p, h1, h2, h3, h4, h5, h6, li, blockquote",
  );
  if (paragraphs.length === 0) return null;

  // Get the container's scroll position and visible area
  const containerRect = container.getBoundingClientRect();

  // Find the first paragraph that's visible (top edge is at or below container top)
  let firstVisibleParagraph: Element | null = null;
  for (const paragraph of paragraphs) {
    const rect = paragraph.getBoundingClientRect();
    // Check if the paragraph is at least partially visible
    if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
      firstVisibleParagraph = paragraph;
      break;
    }
  }

  if (!firstVisibleParagraph) return null;

  // Calculate the text offset of this paragraph using TreeWalker
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let offset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    // Check if this text node is inside or before our target paragraph
    if (firstVisibleParagraph.contains(node)) {
      // Found the start of our target paragraph
      return offset;
    }
    offset += node.textContent?.length ?? 0;
  }

  return offset;
}

/**
 * Scrolls to the position in the content corresponding to the given text offset.
 */
export function scrollToReadingPosition(
  container: HTMLElement,
  offset: number,
  behavior: ScrollBehavior = "smooth",
): boolean {
  if (offset <= 0) return false;

  // Walk through text nodes to find the one at the given offset
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let currentOffset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const nodeLength = node.textContent?.length ?? 0;
    if (currentOffset + nodeLength >= offset) {
      // Found the text node containing our offset
      // Find the enclosing paragraph element
      let element: HTMLElement | null = node.parentElement;
      while (element && element !== container) {
        const tagName = element.tagName.toLowerCase();
        if (
          [
            "p",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "li",
            "blockquote",
          ].includes(tagName)
        ) {
          element.scrollIntoView({ behavior, block: "start" });
          return true;
        }
        element = element.parentElement;
      }
      // If no paragraph found, scroll to the text node's parent
      if (node.parentElement) {
        node.parentElement.scrollIntoView({ behavior, block: "start" });
        return true;
      }
      break;
    }
    currentOffset += nodeLength;
  }

  return false;
}

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
  capturePosition: (container: HTMLElement) => number | null;
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
   * Manually save a specific offset
   */
  saveOffset: (offset: number) => void;
}

/**
 * Hook for tracking and syncing reading progress for a bookmark.
 *
 * Usage:
 * 1. Call the hook with the bookmarkId and initial offset
 * 2. On mount, call restorePosition() to scroll to saved position
 * 3. On unmount/visibility change, call saveProgress() to persist position
 */
export function useReadingProgress(
  options: UseReadingProgressOptions,
): UseReadingProgressResult {
  const { bookmarkId, initialOffset, enabled = true } = options;

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
    const offset = getReadingPosition(container);
    if (offset !== null) {
      setCurrentOffset(offset);
    }
    return offset;
  }, []);

  const restorePosition = useCallback(
    (container: HTMLElement, behavior: ScrollBehavior = "smooth") => {
      if (initialOffset && initialOffset > 0) {
        return scrollToReadingPosition(container, initialOffset, behavior);
      }
      return false;
    },
    [initialOffset],
  );

  const saveOffset = useCallback(
    (offset: number) => {
      if (!enabled) return;
      // Only save if offset has meaningfully changed
      if (
        lastSavedOffset.current === null ||
        Math.abs(offset - lastSavedOffset.current) > 100
      ) {
        lastSavedOffset.current = offset;
        updateProgress({
          bookmarkId,
          readingProgressOffset: offset,
        });
      }
    },
    [enabled, bookmarkId, updateProgress],
  );

  const saveProgress = useCallback(
    (container: HTMLElement) => {
      if (!enabled) return;
      const offset = getReadingPosition(container);
      if (offset !== null && offset > 0) {
        saveOffset(offset);
      }
    },
    [enabled, saveOffset],
  );

  return {
    currentOffset,
    isSaving,
    capturePosition,
    restorePosition,
    saveProgress,
    saveOffset,
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

  // Set up auto-save on visibility change and beforeunload (web only)
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const saveCurrentProgress = () => {
      if (containerRef.current) {
        progress.saveProgress(containerRef.current);
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
      // Save on unmount
      saveCurrentProgress();
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabled, containerRef, progress]);

  // Restore position on mount
  useEffect(() => {
    if (!enabled || !options.initialOffset) return;

    // Use a small delay to ensure content is rendered
    const timer = setTimeout(() => {
      if (containerRef.current) {
        progress.restorePosition(containerRef.current, "instant");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [enabled, options.initialOffset, containerRef, progress]);

  return progress;
}
