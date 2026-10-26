import type { Page } from "patchright";

import {
  buildScreenPdfPageCss,
  computeScreenPdfLayout,
  computeScreenPdfScrollTarget,
  SCREEN_PDF_SCROLL_DELAY_MS,
  SCREEN_PDF_SCROLL_STEP_PX,
  SCREEN_PDF_SAFE_MAX_PAGE_HEIGHT_PX,
  SCREEN_PDF_SAFE_MAX_TOTAL_HEIGHT_PX,
  SCREEN_PDF_VIEWPORT_HEIGHT,
  SCREEN_PDF_VIEWPORT_WIDTH,
} from "./screenPdfLayout";
import type { ScreenPdfLayout } from "./screenPdfLayout";

const STYLE_ELEMENT_ID = "__karakeep_screen_pdf_style";

interface ScreenPdfRestoreEntry {
  el: HTMLElement;
  style: string | null;
  loading: string | null;
  hadLoading: boolean;
}

interface ScreenPdfRestoreState {
  entries: ScreenPdfRestoreEntry[];
  seen: WeakSet<HTMLElement>;
}

export interface PreparedScreenPdf {
  rawHeight: number;
  width: number;
  pinnedCount: number;
  fixedCount: number;
}

export interface ScreenPdfCaptureDetails extends PreparedScreenPdf {
  layout: ScreenPdfLayout;
}

export interface CaptureScreenPdfOptions {
  maxPageHeightPx: number;
  maxTotalHeightPx: number;
  /** How long to wait for lazy images/fonts after each scroll pass. */
  lazyLoadWaitMs: number;
  /** Called with the final layout, both on the first attempt and on fallback. */
  onLayout?: (details: ScreenPdfCaptureDetails) => void;
  onFallback?: (
    error: unknown,
    requested: ScreenPdfLayout,
    fallback: ScreenPdfLayout,
  ) => void;
}

/**
 * Captures the page as a "Screen PDF": the on-screen layout (`@media screen`)
 * rendered as one tall PDF page (or as few tall pages as the configured caps
 * require). Text and links stay selectable/clickable because this is Chromium's
 * native print-to-PDF path.
 *
 * The page is mutated for the duration of the render (lazy images forced eager,
 * `vh` elements frozen, fixed elements anchored) and restored afterwards.
 */
export async function captureScreenPdf(
  page: Page,
  options: CaptureScreenPdfOptions,
): Promise<Buffer> {
  const viewport = page.viewportSize() ?? {
    width: SCREEN_PDF_VIEWPORT_WIDTH,
    height: SCREEN_PDF_VIEWPORT_HEIGHT,
  };

  try {
    await page.emulateMedia({ media: "screen" });

    // tsx/esbuild's `keepNames` transform injects `__name(...)` calls into
    // functions serialized by page.evaluate(). The page context doesn't have
    // that helper, so provide a no-op shim before evaluating our helpers.
    await page.evaluate(
      "globalThis.__name = globalThis.__name || ((value) => value); void 0;",
    );

    const initialScrollHeight = await page.evaluate(() =>
      Math.max(
        document.body?.scrollHeight ?? 0,
        document.documentElement?.scrollHeight ?? 0,
        window.innerHeight,
      ),
    );
    const scrollTarget = computeScreenPdfScrollTarget({
      initialScrollHeight,
      minHeight: viewport.height,
      maxTotalHeightPx: options.maxTotalHeightPx,
    });

    const prepared = await prepareScreenPdfPage(page, {
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      maxScrollTarget: scrollTarget,
      maxTotalHeightPx: options.maxTotalHeightPx,
      safeMaxTotalHeightPx: SCREEN_PDF_SAFE_MAX_TOTAL_HEIGHT_PX,
      lazyLoadWaitMs: options.lazyLoadWaitMs,
      scrollStepPx: SCREEN_PDF_SCROLL_STEP_PX,
      scrollDelayMs: SCREEN_PDF_SCROLL_DELAY_MS,
    });

    // Let any requests kicked off by the final scroll pass settle, but keep
    // this bounded so a chatty page can't consume the whole capture budget.
    if (options.lazyLoadWaitMs > 0) {
      await page
        .waitForLoadState("networkidle", {
          timeout: Math.min(options.lazyLoadWaitMs, 3000),
        })
        .catch(() => undefined);
    }

    let layout = computeScreenPdfLayout({
      rawHeight: prepared.rawHeight,
      minHeight: viewport.height,
      maxPageHeightPx: options.maxPageHeightPx,
      maxTotalHeightPx: options.maxTotalHeightPx,
    });

    await applyScreenPdfPageSetup(page, layout);
    options.onLayout?.({ ...prepared, layout });

    try {
      return await generateScreenPdf(page, prepared.width, layout);
    } catch (error) {
      // Very tall pages can make Chromium's print-to-PDF fail. Retry once with
      // conservative caps so the user still gets a (clipped) archive instead of
      // no archive at all.
      const fallbackLayout = computeScreenPdfLayout({
        rawHeight: prepared.rawHeight,
        minHeight: viewport.height,
        maxPageHeightPx: SCREEN_PDF_SAFE_MAX_PAGE_HEIGHT_PX,
        maxTotalHeightPx: SCREEN_PDF_SAFE_MAX_TOTAL_HEIGHT_PX,
      });
      if (fallbackLayout.pageHeight >= layout.pageHeight) {
        throw error;
      }

      options.onFallback?.(error, layout, fallbackLayout);
      layout = fallbackLayout;
      await applyScreenPdfPageSetup(page, layout);
      options.onLayout?.({ ...prepared, layout });
      return await generateScreenPdf(page, prepared.width, layout);
    }
  } finally {
    // Cleanup is best-effort: the page is closed immediately after the
    // capture, and a failed restore must not discard an otherwise valid PDF.
    await restoreScreenPdfPage(page).catch(() => undefined);
    await page.emulateMedia({ media: null }).catch(() => {
      // See above.
    });
  }
}

/**
 * Runs the lazy-load scroll pass, freezes viewport-relative elements, anchors
 * fixed elements, and returns the resulting document height.
 */
async function prepareScreenPdfPage(
  page: Page,
  args: {
    viewportWidth: number;
    viewportHeight: number;
    maxScrollTarget: number;
    maxTotalHeightPx: number;
    safeMaxTotalHeightPx: number;
    lazyLoadWaitMs: number;
    scrollStepPx: number;
    scrollDelayMs: number;
  },
): Promise<PreparedScreenPdf> {
  return page.evaluate(
    async ({
      viewportWidth,
      viewportHeight,
      maxScrollTarget,
      maxTotalHeightPx,
      safeMaxTotalHeightPx,
      lazyLoadWaitMs,
      scrollStepPx,
      scrollDelayMs,
    }) => {
      const win = window as Window & {
        __karakeepScreenPdfRestore?: ScreenPdfRestoreState;
      };
      win.__karakeepScreenPdfRestore ??= {
        entries: [],
        seen: new WeakSet<HTMLElement>(),
      };
      const state = win.__karakeepScreenPdfRestore;

      const remember = (el: HTMLElement) => {
        if (state.seen.has(el)) {
          return;
        }
        state.seen.add(el);
        state.entries.push({
          el,
          style: el.getAttribute("style"),
          loading: el.getAttribute("loading"),
          hadLoading: el.hasAttribute("loading"),
        });
      };

      // Scrolling uses the explicit "instant" behavior below, so a page-level
      // `scroll-behavior: smooth` cannot make the lazy-load pass animation-bound.

      // Ask the browser to load below-the-fold images/iframes while scrolling.
      for (const el of Array.from(
        document.querySelectorAll("img[loading], iframe[loading]"),
      )) {
        if (!(el instanceof HTMLElement)) {
          continue;
        }
        if ((el.getAttribute("loading") ?? "").toLowerCase() !== "lazy") {
          continue;
        }
        remember(el);
        el.setAttribute("loading", "eager");
      }

      const scrollCap =
        maxTotalHeightPx > 0 ? maxTotalHeightPx : safeMaxTotalHeightPx;

      const waitForMediaAndFonts = async () => {
        const pendingImages = Array.from(document.images).filter(
          (img) => !img.complete,
        );
        await Promise.race([
          Promise.all([
            Promise.all(
              pendingImages.map(
                (img) =>
                  new Promise<void>((resolve) => {
                    if (img.complete) {
                      resolve();
                      return;
                    }
                    img.addEventListener("load", () => resolve(), {
                      once: true,
                    });
                    img.addEventListener("error", () => resolve(), {
                      once: true,
                    });
                  }),
              ),
            ),
            document.fonts?.ready ?? Promise.resolve(),
          ]),
          new Promise<void>((resolve) => setTimeout(resolve, lazyLoadWaitMs)),
        ]);
      };

      const scrollThrough = async (target: number) => {
        for (let y = 0; y <= target; y += scrollStepPx) {
          window.scrollTo({ top: y, left: 0, behavior: "instant" });
          await new Promise((resolve) => setTimeout(resolve, scrollDelayMs));
        }
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
      };

      // Scroll through the initial document height. If lazy content expands
      // the document, make one more bounded pass so elements that only appear
      // after scrolling get a chance to load. Never chase more than one
      // expansion, and never go beyond the configured/safe height cap.
      let scrollTarget = maxScrollTarget;
      for (let pass = 0; pass < 2; pass++) {
        if (pass > 0) {
          const currentHeight = Math.max(
            document.body?.scrollHeight ?? 0,
            document.documentElement?.scrollHeight ?? 0,
          );
          if (currentHeight <= scrollTarget + 100) {
            break;
          }
          scrollTarget = Math.min(currentHeight, scrollCap);
        }
        await scrollThrough(scrollTarget);
        await waitForMediaAndFonts();
      }

      // Elements sized with viewport units (100vh and friends) would stretch
      // to the full PDF page height. Pin them to their on-screen height.
      const vhRe = /(^|[^\w-])(?:\d*\.?\d+)(?:s|l|d)?vh\b/i;
      const pinned = new WeakSet<HTMLElement>();
      let pinnedCount = 0;
      const pin = (el: Element) => {
        if (!(el instanceof HTMLElement)) {
          return;
        }
        if (el === document.documentElement || el === document.body) {
          return;
        }
        if (pinned.has(el)) {
          return;
        }
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) {
          return;
        }
        pinned.add(el);
        pinnedCount++;
        remember(el);
        const height = `${rect.height}px`;
        el.style.setProperty("height", height, "important");
        el.style.setProperty("min-height", height, "important");
        el.style.setProperty("max-height", height, "important");
      };

      // Inline styles like style="height: 100vh".
      for (const el of Array.from(document.querySelectorAll("[style]"))) {
        if (vhRe.test(el.getAttribute("style") ?? "")) {
          pin(el);
        }
      }

      // Same-origin stylesheet rules containing viewport units. Cross-origin
      // sheets throw on cssRules access and are intentionally skipped.
      const selectors = new Set<string>();
      const collectSelectors = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            if (vhRe.test(rule.cssText)) {
              selectors.add(rule.selectorText);
            }
          } else if ("cssRules" in rule) {
            try {
              collectSelectors((rule as CSSGroupingRule).cssRules);
            } catch {
              // Ignore inaccessible container rules.
            }
          }
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          collectSelectors(sheet.cssRules);
        } catch {
          // Cross-origin stylesheet.
        }
      }
      for (const selector of selectors) {
        // `*` would pin every element on the page; `html`/`:root`/`body` are
        // already skipped by pin().
        const safeSelector = selector
          .split(",")
          .map((part) => part.trim())
          .filter(
            (part) =>
              part &&
              part !== "*" &&
              part !== "html" &&
              part !== "body" &&
              part !== ":root",
          )
          .join(", ");
        if (!safeSelector) {
          continue;
        }
        try {
          for (const el of Array.from(
            document.querySelectorAll(safeSelector),
          )) {
            pin(el);
          }
        } catch {
          // Ignore selectors the browser can't parse (e.g. pseudo-elements).
        }
      }

      // Fixed elements repeat on every PDF page. Anchor them once at the top.
      let fixedCount = 0;
      for (const el of Array.from(
        document.body.querySelectorAll<HTMLElement>("*"),
      )) {
        if (getComputedStyle(el).position !== "fixed") {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }
        remember(el);
        el.style.setProperty("position", "absolute", "important");
        el.style.setProperty(
          "top",
          `${Math.max(0, rect.top + window.scrollY)}px`,
          "important",
        );
        el.style.setProperty(
          "left",
          `${Math.max(0, rect.left + window.scrollX)}px`,
          "important",
        );
        el.style.setProperty("right", "auto", "important");
        el.style.setProperty("bottom", "auto", "important");
        fixedCount++;
      }

      return {
        rawHeight: Math.max(
          document.body?.scrollHeight ?? 0,
          document.documentElement?.scrollHeight ?? 0,
          viewportHeight,
        ),
        width: viewportWidth,
        pinnedCount,
        fixedCount,
      };
    },
    args,
  );
}

async function applyScreenPdfPageSetup(
  page: Page,
  layout: ScreenPdfLayout,
): Promise<void> {
  await page.evaluate(
    ({ css, styleId }) => {
      document.getElementById(styleId)?.remove();
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    },
    { css: buildScreenPdfPageCss(layout), styleId: STYLE_ELEMENT_ID },
  );
}

async function restoreScreenPdfPage(page: Page): Promise<void> {
  await page.evaluate(
    ({ styleId }) => {
      document.getElementById(styleId)?.remove();

      const win = window as Window & {
        __karakeepScreenPdfRestore?: ScreenPdfRestoreState;
      };
      const state = win.__karakeepScreenPdfRestore;
      if (!state) {
        return;
      }

      for (const entry of state.entries) {
        if (entry.style === null) {
          entry.el.removeAttribute("style");
        } else {
          entry.el.setAttribute("style", entry.style);
        }
        if (entry.hadLoading) {
          entry.el.setAttribute("loading", entry.loading ?? "lazy");
        } else {
          entry.el.removeAttribute("loading");
        }
      }

      delete win.__karakeepScreenPdfRestore;
    },
    { styleId: STYLE_ELEMENT_ID },
  );
}

async function generateScreenPdf(
  page: Page,
  width: number,
  layout: ScreenPdfLayout,
): Promise<Buffer> {
  return page.pdf({
    width: `${width}px`,
    height: `${layout.pageHeight}px`,
    printBackground: true,
    margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    preferCSSPageSize: false,
  });
}
