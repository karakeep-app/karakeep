import type { ReadingPosition } from "./reading-progress-core";
import { getReadingPositionWithViewport } from "./reading-progress-core";

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
export { scrollToReadingPosition } from "./reading-progress-core";

/**
 * Gets the reading position of the topmost visible paragraph.
 * WebView-specific: assumes window-level scrolling (viewport top is always 0).
 */
export function getReadingPosition(
  container: HTMLElement,
): ReadingPosition | null {
  // WebView: viewport top is always 0 (window-level scrolling)
  return getReadingPositionWithViewport(container, 0);
}
