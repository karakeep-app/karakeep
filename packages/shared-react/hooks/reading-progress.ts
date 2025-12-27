"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
    console.log(
      `[RP:claimRestoration] expired claim for ${bookmarkId}, age=${now - existing}ms`,
    );
    restorationClaimed.delete(bookmarkId);
  }

  if (restorationClaimed.has(bookmarkId)) {
    const age = now - (restorationClaimed.get(bookmarkId) ?? 0);
    console.log(
      `[RP:claimRestoration] denied for ${bookmarkId}, existing claim age=${age}ms`,
    );
    return false;
  }

  console.log(`[RP:claimRestoration] granted for ${bookmarkId}`);
  restorationClaimed.set(bookmarkId, now);
  return true;
}

/**
 * Release a restoration claim (called on cleanup if we never actually restored).
 */
function releaseRestoration(bookmarkId: string): void {
  console.log(`[RP:releaseRestoration] releasing claim for ${bookmarkId}`);
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

/**
 * Normalizes text by collapsing all whitespace to single spaces and trimming.
 * This ensures consistent character counting regardless of HTML formatting.
 */
function normalizeText(text: string): string {
  return text
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the normalized length of text for consistent offset calculation.
 */
function normalizeTextLength(text: string): number {
  return normalizeText(text).length;
}

/**
 * Extracts anchor text from a paragraph for position verification.
 * Returns the first ~50 characters of normalized text.
 */
function extractAnchorText(element: Element): string {
  const text = element.textContent ?? "";
  return normalizeText(text).slice(0, 50);
}

/**
 * Reading position data including offset and anchor text for verification.
 */
export interface ReadingPosition {
  offset: number;
  anchor: string;
}

/**
 * Calculates the text offset of the paragraph at the top of the viewport.
 * Finds the paragraph whose top edge is at or near the top of the visible area.
 * Returns both the offset and anchor text for position verification.
 */
export function getReadingPosition(
  container: HTMLElement,
): ReadingPosition | null {
  // Find all paragraph-like elements
  const paragraphs = container.querySelectorAll(
    "p, h1, h2, h3, h4, h5, h6, li, blockquote",
  );
  if (paragraphs.length === 0) return null;

  // Find the scrollable parent to get the correct viewport reference
  const scrollParent = findScrollableParent(container);
  const isWindowScroll = scrollParent === document.documentElement;

  // For window-level scrolling, viewport top is 0; for container scrolling, use container's top
  const viewportTop = isWindowScroll
    ? 0
    : scrollParent.getBoundingClientRect().top;

  // Find the paragraph at the top of the viewport
  // We want the first paragraph whose top edge is at or below the viewport top,
  // OR if a paragraph spans the viewport top, use that one
  let topParagraph: Element | null = null;

  for (const paragraph of paragraphs) {
    const rect = paragraph.getBoundingClientRect();

    // If this paragraph's top is at or below the viewport top, it's our target
    if (rect.top >= viewportTop) {
      topParagraph = paragraph;
      break;
    }

    // If this paragraph spans the viewport top (started above, ends below), use it
    if (rect.top < viewportTop && rect.bottom > viewportTop) {
      topParagraph = paragraph;
      break;
    }
  }

  if (!topParagraph) return null;

  // Extract anchor text for position verification
  const anchor = extractAnchorText(topParagraph);

  console.log("[RP:getReadingPosition] topParagraph:", {
    tagName: topParagraph.tagName,
    anchor,
    rect: topParagraph.getBoundingClientRect(),
    viewportTop,
  });

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
    if (topParagraph.contains(node)) {
      // Found the start of our target paragraph
      return { offset, anchor };
    }
    offset += normalizeTextLength(node.textContent ?? "");
  }

  return { offset, anchor };
}

/**
 * Finds the nearest scrollable ancestor of an element.
 * Handles both standard overflow-based scrolling, Radix ScrollArea components,
 * and window-level scrolling (falls back to document.documentElement).
 */
function findScrollableParent(element: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element.parentElement;

  while (current) {
    const style = getComputedStyle(current);
    const overflowY = style.overflowY;
    const isOverflowScrollable = overflowY === "auto" || overflowY === "scroll";
    // Check for Radix ScrollArea viewport (uses data attribute for scrolling)
    const isRadixViewport = current.hasAttribute(
      "data-radix-scroll-area-viewport",
    );

    const isCandidate = isOverflowScrollable || isRadixViewport;
    const hasScrollContent = current.scrollHeight > current.clientHeight;

    if (isCandidate && hasScrollContent) {
      return current;
    }
    current = current.parentElement;
  }

  // Fall back to document.documentElement for window-level scrolling
  return document.documentElement;
}

const PARAGRAPH_SELECTORS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
];

/**
 * Finds a paragraph by matching its anchor text.
 * Returns the first paragraph whose normalized text starts with the anchor.
 */
function findParagraphByAnchor(
  container: HTMLElement,
  anchor: string,
): Element | null {
  if (!anchor) return null;

  const paragraphs = container.querySelectorAll(PARAGRAPH_SELECTORS.join(", "));

  for (const paragraph of paragraphs) {
    const paragraphAnchor = extractAnchorText(paragraph);
    // Check if the paragraph starts with the same text (allowing for minor differences)
    if (paragraphAnchor === anchor) {
      return paragraph;
    }
  }

  // Fuzzy fallback: check if first 20 chars match
  for (const paragraph of paragraphs) {
    const paragraphAnchor = extractAnchorText(paragraph);
    if (
      paragraphAnchor.slice(0, 20) === anchor.slice(0, 20) &&
      anchor.length >= 20
    ) {
      return paragraph;
    }
  }

  return null;
}

/**
 * Scrolls to the position in the content corresponding to the given text offset.
 * Uses anchor text for verification when available, falling back to offset-based lookup.
 */
export function scrollToReadingPosition(
  container: HTMLElement,
  offset: number,
  behavior: ScrollBehavior = "smooth",
  anchor?: string | null,
): boolean {
  if (offset <= 0) return false;

  // Strategy 1: Try to find paragraph by anchor text (most reliable)
  if (anchor) {
    const anchorMatch = findParagraphByAnchor(container, anchor);
    if (anchorMatch) {
      console.log("[RP:scrollToReadingPosition] Found by anchor:", {
        anchor,
        element: anchorMatch.tagName,
      });
      anchorMatch.scrollIntoView({ behavior, block: "start" });
      return true;
    }
    console.log(
      "[RP:scrollToReadingPosition] Anchor not found, falling back to offset",
    );
  }

  // Strategy 2: Fall back to offset-based lookup
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let currentOffset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textContent = node.textContent ?? "";
    // Use normalized length for consistent offset calculation
    const nodeLength = normalizeTextLength(textContent);

    // Skip nodes with no meaningful content (whitespace-only nodes normalize to length 0)
    if (nodeLength === 0) {
      continue;
    }

    // Check if we've passed the target offset
    if (currentOffset + nodeLength >= offset) {
      // Found the text node containing our offset
      // Find the enclosing paragraph element
      let targetElement: HTMLElement | null = node.parentElement;
      while (targetElement && targetElement !== container) {
        const tagName = targetElement.tagName.toLowerCase();
        if (PARAGRAPH_SELECTORS.includes(tagName)) {
          break;
        }
        targetElement = targetElement.parentElement;
      }

      // Use the text node's parent if no paragraph found
      if (!targetElement || targetElement === container) {
        targetElement = node.parentElement;
      }

      if (targetElement) {
        console.log("[RP:scrollToReadingPosition] Found by offset:", {
          offset,
          element: targetElement.tagName,
          text: targetElement.textContent?.slice(0, 50),
        });
        targetElement.scrollIntoView({ behavior, block: "start" });
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
  console.log("[RP:useReadingProgressAutoSave] hook called", {
    bookmarkId: options.bookmarkId,
    initialOffset: options.initialOffset,
    initialAnchor: options.initialAnchor,
    enabled: options.enabled,
    hasContainerRef: !!options.containerRef,
  });
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
    console.log("[RP:scroll] effect running", {
      enabled,
      hasContainer: !!containerRef.current,
    });
    if (!enabled || typeof window === "undefined") {
      console.log("[RP:scroll] effect skipped - not enabled or no window");
      return;
    }

    const handleScroll = () => {
      if (containerRef.current) {
        const position = getReadingPosition(containerRef.current);
        if (position !== null && position.offset > 0) {
          console.log("[RP:scroll] updated lastKnownPosition:", position);
          lastKnownPositionRef.current = position;
        }
      }
    };

    // Find the scrollable parent - could be a ScrollArea viewport or the window
    const setupScrollListener = () => {
      if (!containerRef.current) {
        console.log("[RP:scroll] no container yet");
        return false;
      }

      // Skip if container is in a hidden layout (e.g., CSS display:none)
      if (!isElementVisible(containerRef.current)) {
        console.log("[RP:scroll] skipping - container not visible");
        return true; // Return true to prevent retry - hidden containers stay hidden
      }

      // Find the nearest scrollable ancestor using shared function
      const foundParent = findScrollableParent(containerRef.current);
      const isWindowScroll = foundParent === document.documentElement;
      const scrollParent: HTMLElement | Window = isWindowScroll
        ? window
        : foundParent;

      console.log("[RP:scroll] found scroll parent:", {
        isWindowScroll,
        className: isWindowScroll
          ? "window"
          : foundParent.className?.slice(0, 50),
      });
      scrollParent.addEventListener("scroll", handleScroll, { passive: true });
      scrollParentRef.current = scrollParent;

      return true;
    };

    // Try to set up immediately
    const immediate = setupScrollListener();

    // Retry after a delay if container not ready
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    if (!immediate) {
      console.log("[RP:scroll] scheduling retry...");
      retryTimer = setTimeout(() => {
        console.log("[RP:scroll] retrying setup...");
        setupScrollListener();
      }, 300);
    }

    return () => {
      console.log("[RP:scroll] cleanup", {
        hasScrollParent: !!scrollParentRef.current,
      });
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
    console.log("[RP:autoSave] effect setup", {
      enabled,
      hasWindow: typeof window !== "undefined",
    });
    if (!enabled || typeof window === "undefined") {
      console.log("[RP:autoSave] effect skipped - not enabled or no window");
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

      console.log("[RP:autoSave] saveCurrentProgress", {
        hasRef: !!containerRef.current,
        lastKnownPosition: lastKnownPositionRef.current,
        positionToSave,
      });

      if (positionToSave !== null && positionToSave.offset > 0) {
        savePositionRef.current(positionToSave);
      } else {
        console.log("[RP:autoSave] no position to save!");
      }
    };

    const handleVisibilityChange = () => {
      console.log("[RP:autoSave] visibilitychange:", document.visibilityState);
      if (document.visibilityState === "hidden") {
        saveCurrentProgress();
      }
    };

    const handleBeforeUnload = () => {
      console.log("[RP:autoSave] beforeunload");
      saveCurrentProgress();
    };

    // Setup function that waits for container to be ready and visible
    const setupAutoSave = () => {
      if (!containerRef.current) {
        console.log("[RP:autoSave] no container yet");
        return false;
      }

      // Skip if container is in a hidden layout (e.g., CSS display:none)
      if (!isElementVisible(containerRef.current)) {
        console.log("[RP:autoSave] skipping - container not visible");
        return true; // Return true to prevent retry - hidden containers stay hidden
      }

      console.log("[RP:autoSave] adding event listeners");
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
      console.log("[RP:autoSave] scheduling retry...");
      retryTimer = setTimeout(() => {
        console.log("[RP:autoSave] retrying setup...");
        setupAutoSave();
      }, 300);
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (autoSaveAttachedRef.current) {
        console.log("[RP:autoSave] cleanup - saving and removing listeners");
        // Save on unmount
        saveCurrentProgress();
        window.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("beforeunload", handleBeforeUnload);
        autoSaveAttachedRef.current = false;
      } else {
        console.log("[RP:autoSave] cleanup - no listeners were attached");
      }
    };
  }, [enabled, containerRef]);

  // Restore position on mount - use requestAnimationFrame for reliability
  // Track whether THIS instance successfully restored (for cleanup purposes)
  const didRestoreRef = useRef(false);
  // Track whether THIS instance claimed the lock (for cleanup purposes)
  const hasLockRef = useRef(false);

  useEffect(() => {
    // Generate unique ID for this effect instance to track in logs
    const effectId = Math.random().toString(36).slice(2, 6);
    console.log(`[RP:restore:${effectId}] effect running`, {
      enabled,
      bookmarkId: options.bookmarkId,
      initialOffset: options.initialOffset,
      hasContainerRef: !!containerRef.current,
    });

    if (!enabled || !options.initialOffset) {
      console.log(
        `[RP:restore:${effectId}] skipping - not enabled or no initialOffset`,
      );
      return;
    }

    // Use an object for per-effect-instance cancellation
    const state = { cancelled: false };

    // Container not ready, use RAF polling to wait for layout
    let attempts = 0;
    const maxAttempts = 120; // ~2 seconds at 60fps

    const tryRestore = () => {
      if (state.cancelled) {
        console.log(`[RP:restore:${effectId}] cancelled, stopping`);
        return;
      }

      attempts++;
      const container = containerRef.current;

      // Skip if container is in a hidden layout (e.g., CSS display:none)
      // Check this BEFORE claiming the lock so hidden instances never block visible ones
      if (container && !isElementVisible(container)) {
        console.log(
          `[RP:restore:${effectId}] container not visible, giving up`,
        );
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

      console.log(`[RP:restore:${effectId}] attempt`, attempts, {
        hasRef: !!container,
        isVisible: container ? isElementVisible(container) : false,
        hasScrollParent: !!scrollParent,
        isWindowScroll,
        isLayoutReady,
      });

      if (container && isLayoutReady) {
        // Now try to claim the lock - only when we're ready to restore
        // This handles both StrictMode double-mounting AND multiple component instances.
        if (!hasLockRef.current && !claimRestoration(options.bookmarkId)) {
          console.log(
            `[RP:restore:${effectId}] another instance already restored`,
          );
          return; // Someone else already restored
        }
        hasLockRef.current = true;

        console.log(`[RP:restore:${effectId}] layout ready, restoring...`);
        const result = restorePositionRef.current(container, "instant");
        console.log(`[RP:restore:${effectId}] restorePosition result:`, result);
        didRestoreRef.current = true;
        // Keep the lock - we successfully restored
        return; // Done
      }

      if (attempts < maxAttempts) {
        requestAnimationFrame(tryRestore);
      } else {
        console.log(
          `[RP:restore:${effectId}] gave up after`,
          maxAttempts,
          "attempts",
        );
      }
    };

    // Start the animation frame loop
    console.log(`[RP:restore:${effectId}] scheduling RAF`);
    requestAnimationFrame(tryRestore);

    return () => {
      console.log(`[RP:restore:${effectId}] cleanup`, {
        hasLock: hasLockRef.current,
        didRestore: didRestoreRef.current,
      });
      state.cancelled = true;
      // Release lock if we claimed it - this allows reopening the preview to work
      // The lock's purpose is to prevent concurrent restoration during mount,
      // not to prevent restoration on subsequent opens
      if (hasLockRef.current) {
        console.log(`[RP:restore:${effectId}] releasing lock on cleanup`);
        releaseRestoration(options.bookmarkId);
        hasLockRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, options.initialOffset, options.bookmarkId]);

  return progress;
}
