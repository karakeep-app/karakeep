/**
 * Pure layout math for the Screen PDF archive variant.
 *
 * A Screen PDF is rendered as a normal browser viewport (1440×900) laid out on
 * one very tall PDF page. PDF viewers and Chromium itself choke on extremely
 * tall pages, so the page is split into as few equally-sized pages as possible
 * when the configured per-page limit is exceeded.
 */

export const SCREEN_PDF_VIEWPORT_WIDTH = 1440;
export const SCREEN_PDF_VIEWPORT_HEIGHT = 900;

/**
 * Fallbacks used when a capture fails because the requested page is too tall.
 * Chrome 156 renders a 60,000px page fine but fails somewhere above ~80,000px.
 * These values keep the retry safely below that limit while still using pages
 * that comfortably fit in mainstream PDF viewers.
 */
export const SCREEN_PDF_SAFE_MAX_TOTAL_HEIGHT_PX = 60_000;
export const SCREEN_PDF_SAFE_MAX_PAGE_HEIGHT_PX = 19_200;

/**
 * Hard ceiling on how far lazy-load scrolling will go when the total-height
 * cap is disabled (0). Infinite feeds ("load more" article lists) can grow the
 * document without bound while it is being scrolled, so the scroll depth - and
 * with it the number of viewport-sized steps - must stay finite regardless of
 * how the server is configured. Time is bounded separately by the capture
 * deadline (`CRAWLER_SCREEN_PDF_TIMEOUT_SEC`).
 */
export const SCREEN_PDF_MAX_UNCAPPED_SCROLL_PX = 150_000;

export const SCREEN_PDF_SCROLL_STEP_PX = 900;
export const SCREEN_PDF_SCROLL_DELAY_MS = 80;

/**
 * How deep to scroll for lazy content: never deeper than the content that will
 * actually be rendered, and never past the uncapped ceiling as an infinite-
 * feed guard.
 */
export function screenPdfScrollCeiling(maxTotalHeightPx: number): number {
  return maxTotalHeightPx > 0
    ? maxTotalHeightPx
    : SCREEN_PDF_MAX_UNCAPPED_SCROLL_PX;
}

/**
 * Extra room on each balanced page. Print layout can differ slightly from the
 * on-screen layout (page breaks inside large paddings, rounding), so a page
 * that exactly fits on screen can spill a few pixels onto a spurious extra
 * page. This slack keeps the last page from being almost empty without giving
 * up the balanced page split.
 */
export const SCREEN_PDF_PAGE_HEIGHT_SLACK_PX = 500;

export interface ScreenPdfLayoutInput {
  /** Document height measured after viewport-relative elements were frozen. */
  rawHeight: number;
  /** At least this tall, so very short pages still fill the viewport. */
  minHeight: number;
  /** Maximum height of a single PDF page. 0 disables the per-page cap. */
  maxPageHeightPx: number;
  /** Maximum total document height to render. 0 disables the total cap. */
  maxTotalHeightPx: number;
}

export interface ScreenPdfLayout {
  /** Height of the document that will actually be rendered. */
  measuredHeight: number;
  /** Document height after applying the total-height cap. */
  totalHeight: number;
  /** Height of each PDF page. */
  pageHeight: number;
  /** Number of PDF pages Chromium will generate. */
  numPages: number;
  /** Whether content below `totalHeight` is clipped. */
  clipped: boolean;
}

export function computeScreenPdfLayout({
  rawHeight,
  minHeight,
  maxPageHeightPx,
  maxTotalHeightPx,
}: ScreenPdfLayoutInput): ScreenPdfLayout {
  const measuredHeight = Math.max(rawHeight, minHeight, 1);
  const clipped = maxTotalHeightPx > 0 && measuredHeight > maxTotalHeightPx;
  const totalHeight = clipped ? maxTotalHeightPx : measuredHeight;

  let numPages = 1;
  let pageHeight: number;
  if (maxPageHeightPx > 0 && totalHeight > maxPageHeightPx) {
    numPages = Math.ceil(totalHeight / maxPageHeightPx);
    pageHeight = Math.min(
      maxPageHeightPx,
      Math.ceil(totalHeight / numPages) + SCREEN_PDF_PAGE_HEIGHT_SLACK_PX,
    );
  } else {
    // The extra pixel prevents subpixel rounding from spilling content onto an
    // empty second page.
    pageHeight = totalHeight + 1;
  }

  return {
    measuredHeight,
    totalHeight,
    pageHeight,
    numPages,
    clipped,
  };
}

/**
 * How far to scroll during the lazy-loading pass. Never chase a growing
 * document (infinite-scroll feeds), and never scroll further than the content
 * that will actually be rendered. When the total cap is disabled the document
 * is rendered in full, but scrolling still stops at
 * `SCREEN_PDF_MAX_UNCAPPED_SCROLL_PX` so feeds that keep loading more content
 * cannot make the capture unbounded.
 */
export function computeScreenPdfScrollTarget({
  initialScrollHeight,
  minHeight,
  maxTotalHeightPx,
}: {
  initialScrollHeight: number;
  minHeight: number;
  maxTotalHeightPx: number;
}): number {
  return Math.max(
    0,
    Math.min(
      Math.max(initialScrollHeight, minHeight),
      screenPdfScrollCeiling(maxTotalHeightPx),
    ),
  );
}

/** CSS injected only for the duration of the PDF render. */
export function buildScreenPdfPageCss(layout: ScreenPdfLayout): string {
  // Deliberately no global break-before/break-after rules: applying them to
  // every element forces breaks at arbitrary elements and can produce large
  // blank areas (or an almost-empty extra page). Chromium's natural pagination
  // is a better fit for a screen-layout archive.
  const rules = ["@page { margin: 0 !important; }"];
  if (layout.clipped) {
    rules.push(
      `html, body {
        max-height: ${layout.totalHeight}px !important;
        overflow: hidden !important;
      }`,
    );
  }
  return rules.join("\n");
}
