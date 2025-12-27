/**
 * Reading Progress Core Utilities
 *
 * Shared functions for reading position tracking.
 * Used by both DOM (web) and WebView (React Native) implementations.
 */

/**
 * Reading position data including offset and anchor text for verification.
 */
export interface ReadingPosition {
  offset: number;
  anchor: string;
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

const PARAGRAPH_SELECTOR_STRING = PARAGRAPH_SELECTORS.join(", ");

/**
 * Maximum length of anchor text extracted from paragraphs.
 * Used for position verification when restoring reading progress.
 */
export const ANCHOR_TEXT_MAX_LENGTH = 50;

/**
 * Normalizes text by collapsing all whitespace to single spaces and trimming.
 * This ensures consistent character counting regardless of HTML formatting.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the normalized length of text for consistent offset calculation.
 */
export function normalizeTextLength(text: string): number {
  return normalizeText(text).length;
}

/**
 * Calculates the text offset of the paragraph at the top of the viewport.
 * Finds the paragraph whose top edge is at or near the top of the visible area.
 * Returns both the offset and anchor text for position verification.
 *
 * @param container - The container element containing the content
 * @param viewportTop - The Y coordinate of the viewport top (0 for window scrolling)
 */
export function getReadingPositionWithViewport(
  container: HTMLElement,
  viewportTop: number,
): ReadingPosition | null {
  const paragraphs = Array.from(
    container.querySelectorAll(PARAGRAPH_SELECTOR_STRING),
  );
  if (paragraphs.length === 0) return null;

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
  const anchor = normalizeText(topParagraph.textContent ?? "").slice(
    0,
    ANCHOR_TEXT_MAX_LENGTH,
  );

  // Calculate the text offset of this paragraph using TreeWalker
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let offset = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (topParagraph.contains(node)) {
      // Found the start of our target paragraph
      return { offset, anchor };
    }
    offset += normalizeTextLength(node.textContent ?? "");
  }

  // topParagraph has no text nodes (empty or contains only non-text elements)
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
    const paragraphs = Array.from(
      container.querySelectorAll(PARAGRAPH_SELECTOR_STRING),
    );

    // Exact match first
    for (const paragraph of paragraphs) {
      const paragraphAnchor = normalizeText(paragraph.textContent ?? "").slice(
        0,
        ANCHOR_TEXT_MAX_LENGTH,
      );
      if (paragraphAnchor === anchor) {
        paragraph.scrollIntoView({ behavior, block: "start" });
        return true;
      }
    }

    // Fuzzy fallback: check if first 20 chars match
    for (const paragraph of paragraphs) {
      const paragraphAnchor = normalizeText(paragraph.textContent ?? "").slice(
        0,
        ANCHOR_TEXT_MAX_LENGTH,
      );
      if (
        paragraphAnchor.slice(0, 20) === anchor.slice(0, 20) &&
        anchor.length >= 20
      ) {
        paragraph.scrollIntoView({ behavior, block: "start" });
        return true;
      }
    }
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
        targetElement.scrollIntoView({ behavior, block: "start" });
        return true;
      }
      break;
    }

    currentOffset += nodeLength;
  }

  return false;
}
