import type { ReadingPosition } from "./reading-progress-core";
import {
  extractAnchorText,
  normalizeTextLength,
  PARAGRAPH_SELECTOR_STRING,
} from "./reading-progress-core";

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

// Re-export shared functions for the WebView bundle
export {
  extractAnchorText,
  findParagraphByAnchor,
  normalizeText,
  normalizeTextLength,
  scrollToReadingPosition,
} from "./reading-progress-core";

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
