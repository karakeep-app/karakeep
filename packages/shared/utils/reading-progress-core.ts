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

export const PARAGRAPH_SELECTORS = [
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

export const PARAGRAPH_SELECTOR_STRING = PARAGRAPH_SELECTORS.join(", ");

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
 * Extracts anchor text from a paragraph for position verification.
 * Returns the first ~50 characters of normalized text.
 */
export function extractAnchorText(element: Element): string {
  const text = element.textContent ?? "";
  return normalizeText(text).slice(0, 50);
}

/**
 * Finds a paragraph by matching its anchor text.
 * Returns the first paragraph whose normalized text starts with the anchor.
 */
export function findParagraphByAnchor(
  container: HTMLElement,
  anchor: string,
): Element | null {
  if (!anchor) return null;

  const paragraphs = Array.from(
    container.querySelectorAll(PARAGRAPH_SELECTOR_STRING),
  );

  // Exact match first
  for (const paragraph of paragraphs) {
    const paragraphAnchor = extractAnchorText(paragraph);
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
      anchorMatch.scrollIntoView({ behavior, block: "start" });
      return true;
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
