/**
 * Reading Progress DOM Utilities
 *
 * This module provides reading position tracking functions in TWO forms:
 *
 * 1. **JavaScript strings** (e.g., `GET_READING_POSITION_JS`) - For injection into
 *    WebViews where we can't import modules. Used by mobile React Native app.
 *
 * 2. **TypeScript functions** (e.g., `getReadingPosition()`) - For direct use in
 *    web contexts where we have full DOM access. Used by web React hooks.
 *
 * WHY THIS PATTERN?
 * - WebViews run in isolated browser contexts that can't import JS modules
 * - We need the SAME algorithm in both places to ensure cross-platform consistency
 * - Maintaining two copies leads to drift (mobile was missing whitespace normalization)
 * - This single-source-of-truth approach ensures bug fixes apply everywhere
 *
 * The JavaScript strings and TypeScript functions implement identical logic.
 * When updating one, update the other to match.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Reading position data including offset and anchor text for verification.
 */
export interface ReadingPosition {
  offset: number;
  anchor: string;
}

// =============================================================================
// Constants
// =============================================================================

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

// =============================================================================
// JavaScript String Exports (for WebView injection)
// =============================================================================

/**
 * Whitespace normalization functions as injectable JavaScript.
 * Ensures consistent character counting regardless of HTML formatting.
 */
export const NORMALIZE_TEXT_JS = `
function normalizeText(text) {
  return text
    .replace(/[\\n\\r\\t]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function normalizeTextLength(text) {
  return normalizeText(text).length;
}
`;

/**
 * Anchor text extraction as injectable JavaScript.
 * Returns the first ~50 characters of normalized text for position verification.
 */
export const EXTRACT_ANCHOR_TEXT_JS = `
function extractAnchorText(element) {
  var text = element.textContent || "";
  return normalizeText(text).slice(0, 50);
}
`;

/**
 * Paragraph matching by anchor text as injectable JavaScript.
 */
export const FIND_PARAGRAPH_BY_ANCHOR_JS = `
function findParagraphByAnchor(container, anchor) {
  if (!anchor) return null;

  var paragraphs = container.querySelectorAll("${PARAGRAPH_SELECTOR_STRING}");

  // Exact match first
  for (var i = 0; i < paragraphs.length; i++) {
    var paragraphAnchor = extractAnchorText(paragraphs[i]);
    if (paragraphAnchor === anchor) {
      return paragraphs[i];
    }
  }

  // Fuzzy fallback: check if first 20 chars match
  for (var j = 0; j < paragraphs.length; j++) {
    var pAnchor = extractAnchorText(paragraphs[j]);
    if (pAnchor.slice(0, 20) === anchor.slice(0, 20) && anchor.length >= 20) {
      return paragraphs[j];
    }
  }

  return null;
}
`;

/**
 * Get reading position as injectable JavaScript.
 * Finds the topmost visible paragraph and returns offset + anchor.
 */
export const GET_READING_POSITION_JS = `
function getReadingPosition(container) {
  var paragraphs = container.querySelectorAll("${PARAGRAPH_SELECTOR_STRING}");
  if (paragraphs.length === 0) return null;

  // For WebView context, viewport top is always 0 (window-level scrolling)
  var viewportTop = 0;

  // Find the paragraph at the top of the viewport
  var topParagraph = null;

  for (var i = 0; i < paragraphs.length; i++) {
    var rect = paragraphs[i].getBoundingClientRect();

    // If this paragraph's top is at or below the viewport top, it's our target
    if (rect.top >= viewportTop) {
      topParagraph = paragraphs[i];
      break;
    }

    // If this paragraph spans the viewport top (started above, ends below), use it
    if (rect.top < viewportTop && rect.bottom > viewportTop) {
      topParagraph = paragraphs[i];
      break;
    }
  }

  if (!topParagraph) return null;

  // Extract anchor text for position verification
  var anchor = extractAnchorText(topParagraph);

  // Calculate the text offset of this paragraph using TreeWalker
  var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  var offset = 0;
  var node;

  while ((node = walker.nextNode())) {
    if (topParagraph.contains(node)) {
      // Found the start of our target paragraph
      return { offset: offset, anchor: anchor };
    }
    offset += normalizeTextLength(node.textContent || "");
  }

  return { offset: offset, anchor: anchor };
}
`;

/**
 * Scroll to reading position as injectable JavaScript.
 * Uses anchor text for verification when available, falling back to offset-based lookup.
 */
export const SCROLL_TO_READING_POSITION_JS = `
function scrollToReadingPosition(container, offset, behavior, anchor) {
  if (offset <= 0) return false;

  // Strategy 1: Try to find paragraph by anchor text (most reliable)
  if (anchor) {
    var anchorMatch = findParagraphByAnchor(container, anchor);
    if (anchorMatch) {
      anchorMatch.scrollIntoView({ behavior: behavior || "smooth", block: "start" });
      return true;
    }
  }

  // Strategy 2: Fall back to offset-based lookup
  var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  var currentOffset = 0;
  var node;

  while ((node = walker.nextNode())) {
    var textContent = node.textContent || "";
    var nodeLength = normalizeTextLength(textContent);

    // Skip nodes with no meaningful content
    if (nodeLength === 0) continue;

    // Check if we've passed the target offset
    if (currentOffset + nodeLength >= offset) {
      // Find the enclosing paragraph element
      var targetElement = node.parentElement;
      var paragraphTags = ["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE"];

      while (targetElement && targetElement !== container) {
        if (paragraphTags.indexOf(targetElement.tagName) !== -1) {
          break;
        }
        targetElement = targetElement.parentElement;
      }

      if (!targetElement || targetElement === container) {
        targetElement = node.parentElement;
      }

      if (targetElement) {
        targetElement.scrollIntoView({ behavior: behavior || "smooth", block: "start" });
        return true;
      }
      break;
    }

    currentOffset += nodeLength;
  }

  return false;
}
`;

/**
 * All reading progress functions combined for easy WebView injection.
 * This is the main export for mobile usage.
 */
export const READING_PROGRESS_CORE_JS = `
${NORMALIZE_TEXT_JS}
${EXTRACT_ANCHOR_TEXT_JS}
${FIND_PARAGRAPH_BY_ANCHOR_JS}
${GET_READING_POSITION_JS}
${SCROLL_TO_READING_POSITION_JS}
`;

// =============================================================================
// TypeScript Function Exports (for web usage)
// =============================================================================

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

  // Convert to array for iteration (NodeListOf doesn't have Symbol.iterator in all TS configs)
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
  // Convert to array for iteration (NodeListOf doesn't have Symbol.iterator in all TS configs)
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
