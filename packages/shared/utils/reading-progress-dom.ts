import type { ReadingPosition } from "./reading-progress-core";
import {
  extractAnchorText,
  normalizeTextLength,
  PARAGRAPH_SELECTOR_STRING,
} from "./reading-progress-core";

/**
 * Reading Progress DOM Utilities
 *
 * TypeScript functions for reading position tracking in web contexts.
 * Includes findScrollableParent() for Radix ScrollArea and nested scrolling.
 */

// Re-export shared functions for convenience
export type { ReadingPosition } from "./reading-progress-core";
export {
  extractAnchorText,
  findParagraphByAnchor,
  normalizeText,
  normalizeTextLength,
  scrollToReadingPosition,
} from "./reading-progress-core";

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
 */
export function getReadingPosition(
  container: HTMLElement,
): ReadingPosition | null {
  // Find all paragraph-like elements
  const paragraphs = Array.from(
    container.querySelectorAll(PARAGRAPH_SELECTOR_STRING),
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

  // topParagraph has no text nodes (empty or contains only non-text elements)
  return null;
}
