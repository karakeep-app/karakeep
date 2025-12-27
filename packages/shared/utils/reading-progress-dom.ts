import type { ReadingPosition } from "./reading-progress-core";
import { getReadingPositionWithViewport } from "./reading-progress-core";

/**
 * Reading Progress DOM Utilities
 *
 * TypeScript functions for reading position tracking in web contexts.
 * Includes findScrollableParent() for Radix ScrollArea and nested scrolling.
 */

// Re-export shared functions for convenience
export type { ReadingPosition } from "./reading-progress-core";
export { scrollToReadingPosition } from "./reading-progress-core";

/**
 * Finds the nearest scrollable ancestor of an element.
 * Handles both standard overflow-based scrolling, Radix ScrollArea components,
 * and window-level scrolling (falls back to document.documentElement).
 */
export function findScrollableParent(element: HTMLElement): HTMLElement {
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

/**
 * Calculates the text offset of the paragraph at the top of the viewport.
 * Finds the paragraph whose top edge is at or near the top of the visible area.
 * Returns both the offset and anchor text for position verification.
 *
 * Web-specific: handles nested scrolling with Radix ScrollArea detection.
 */
export function getReadingPosition(
  container: HTMLElement,
): ReadingPosition | null {
  // Find the scrollable parent to get the correct viewport reference
  const scrollParent = findScrollableParent(container);
  const isWindowScroll = scrollParent === document.documentElement;

  // For window-level scrolling, viewport top is 0; for container scrolling, use container's top
  const viewportTop = isWindowScroll
    ? 0
    : scrollParent.getBoundingClientRect().top;

  return getReadingPositionWithViewport(container, viewportTop);
}
