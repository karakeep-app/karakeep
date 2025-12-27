/**
 * WebView-specific reading progress utilities.
 *
 * This module is compiled by esbuild to generate reading-progress-webview.generated.ts
 *
 * Key differences from reading-progress-dom.ts:
 * - No findScrollableParent (WebView uses window-level scrolling only)
 * - getReadingPosition assumes viewport top is always 0
 * - Output is ES5-compatible for React Native WebView
 *
 * To regenerate the output: pnpm --filter @karakeep/shared generate:webview-js
 */

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
 * Normalizes text by collapsing all whitespace to single spaces and trimming.
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
 */
export function findParagraphByAnchor(
  container: HTMLElement,
  anchor: string,
): Element | null {
  if (!anchor) return null;

  const paragraphs = container.querySelectorAll(PARAGRAPH_SELECTOR_STRING);

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
 * Reading position with offset and anchor text for verification.
 */
interface ReadingPosition {
  offset: number;
  anchor: string;
}

/**
 * Gets the reading position of the topmost visible paragraph.
 * WebView-specific: assumes window-level scrolling (viewport top is always 0).
 */
export function getReadingPosition(
  container: HTMLElement,
): ReadingPosition | null {
  const paragraphs = container.querySelectorAll(PARAGRAPH_SELECTOR_STRING);
  if (paragraphs.length === 0) return null;

  // WebView: viewport top is always 0 (window-level scrolling)
  const viewportTop = 0;

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
    if (topParagraph.contains(node)) {
      // Found the start of our target paragraph
      return { offset, anchor };
    }
    offset += normalizeTextLength(node.textContent ?? "");
  }

  return { offset, anchor };
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
    const nodeLength = normalizeTextLength(textContent);

    // Skip nodes with no meaningful content
    if (nodeLength === 0) continue;

    // Check if we've passed the target offset
    if (currentOffset + nodeLength >= offset) {
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
