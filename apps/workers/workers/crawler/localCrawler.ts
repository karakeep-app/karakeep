// The local crawler: everything that talks to the crawled website. It probes
// URLs, fetches pages with the browser (or over plain HTTP when there's no
// browser or the user has browser crawling disabled) and downloads assets.

import { fetchWithProxy, matchesNoProxy, validateUrl } from "../../network";
// patchright is a drop-in Playwright fork that drives Chrome without enabling
// the CDP Runtime domain, the most widely checked automation signal.
import {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from "patchright";
import {
  abortRace,
  abortRaceResolve,
  raceWith,
  timeoutRace,
  timeoutRejectRace,
} from "../../utils";

import {
  addLogFields,
  ASSET_TYPES,
  setSpanAttributes,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { tryCatch } from "@karakeep/shared/tryCatch";

import type { CrawlContext, CrawlPageResult, UrlProbeResult } from "./common";
import {
  installAutoconsent,
  waitForPageLoadAndAutoconsent,
} from "../utils/autoconsent";
import { waitForChallengeToClear } from "../utils/botChallenge";
import {
  CONTEXT_CLOSE_TIMEOUT_MS,
  getBrowserUserAgent,
  getGlobalBlocker,
  getGlobalBrowser,
  getGlobalCookies,
  getPlaywrightProxyConfig,
  PAGE_CLOSE_TIMEOUT_MS,
  startBrowserInstance,
  trackContext,
  untrackContext,
} from "../utils/browser";
import {
  normalizeContentType,
  shouldRetryCrawlStatusCode,
  truncateUrl,
} from "../utils/crawlerUtils";
import { isLikelyChallengePage } from "../utils/metadataResolver";
import { runParseSubprocess } from "../utils/parseSubprocess";
import { installRedirectGuard } from "../utils/redirectGuard";
import { CAPTURED_ASSETS, span, traced } from "./common";

export { fetchAsset, getContentTypeAndMetadata, screenshotPrecrawledArchive };

// Cap how much of the probed page we buffer for metadata extraction.
// Preview metadata lives in <head>, so a couple of MB is plenty.
const PROBE_MAX_BODY_BYTES = 2 * 1024 * 1024;
// The content-type routing decision needs only the response headers, so it
// keeps the tight timeout the probe always had. The body download (for
// metadata extraction) runs alongside the browser crawl, so it gets a more
// generous overall budget.
const PROBE_HEADERS_TIMEOUT_MS = 5_000;
const PROBE_TIMEOUT_MS = 30_000;

const PROBE_HTML_CONTENT_TYPES = new Set<string>([
  ASSET_TYPES.TEXT_HTML,
  "application/xhtml+xml",
]);

/**
 * Probes the URL with a plain GET to determine its content type. When the
 * response is an HTML page, the body is also parsed (via the parse subprocess
 * in metadata-only mode) so callers get the page's preview metadata without
 * waiting for the full browser render. The returned promise resolves once the
 * content type is known; the metadata extraction keeps running in the
 * background behind `metadata`. Extraction is best-effort and never affects
 * the returned content type.
 */
const getContentTypeAndMetadata = traced(
  "getContentTypeAndMetadata",
  async (
    ctx: CrawlContext,
    opts?: { skipMetadataExtraction?: boolean },
  ): Promise<UrlProbeResult> => {
    const { url, jobId, abortSignal, runProxy, log } = ctx;
    // The request-level signal uses the long budget (it also governs the
    // body read); the wait for the headers is raced separately against the
    // short timeout so a dead host can't delay the routing decision.
    const probeAbort = new AbortController();
    let response;
    try {
      log.info(
        `Attempting to determine the content-type for the url ${truncateUrl(url)}`,
      );
      response = await raceWith(
        fetchWithProxy(
          url,
          {
            method: "GET",
            signal: AbortSignal.any([
              AbortSignal.timeout(PROBE_TIMEOUT_MS),
              abortSignal,
              probeAbort.signal,
            ]),
            size: PROBE_MAX_BODY_BYTES,
            headers: serverConfig.crawler.preflightUserAgent
              ? { "User-Agent": serverConfig.crawler.preflightUserAgent }
              : undefined,
          },
          runProxy,
        ),
        timeoutRejectRace(
          PROBE_HEADERS_TIMEOUT_MS,
          `Timed out after ${PROBE_HEADERS_TIMEOUT_MS}ms waiting for the response headers`,
        ),
      );
    } catch (e) {
      // Stop the underlying fetch if it's still in flight (header timeout).
      probeAbort.abort();
      log.error(
        `Failed to determine the content-type for the url ${truncateUrl(url)}: ${e}`,
      );
      return { contentType: null, metadata: Promise.resolve(null) };
    }
    setSpanAttributes({
      "crawler.getContentType.statusCode": response.status,
    });
    const rawContentType = response.headers.get("content-type");
    const contentType = normalizeContentType(rawContentType);
    setSpanAttributes({
      "crawler.contentType": contentType ?? undefined,
    });
    log.info(
      `Content-type for the url ${truncateUrl(url)} is "${contentType}"`,
    );

    if (!contentType || !PROBE_HTML_CONTENT_TYPES.has(contentType)) {
      return { contentType, metadata: Promise.resolve(null) };
    }

    // A previous run already extracted and stored this page's metadata; the
    // probe was only needed for the content-type routing decision.
    if (opts?.skipMetadataExtraction) {
      log.info(
        `Skipping metadata extraction from the content-type probe for the url ${truncateUrl(url)} as it was already fetched by a previous run`,
      );
      addLogFields<"crawlerWorker.run">({
        "crawler.probe.metadata": "reused_stored",
      });
      return { contentType, metadata: Promise.resolve(null) };
    }

    // A blocked/retryable status usually means a challenge or error page
    // whose metadata would be junk — don't extract it.
    if (shouldRetryCrawlStatusCode(response.status)) {
      log.info(
        `Skipping metadata extraction from the content-type probe for the url ${truncateUrl(url)} due to status code ${response.status}`,
      );
      addLogFields<"crawlerWorker.run">({
        "crawler.probe.metadata": "blocked_status",
      });
      return { contentType, metadata: Promise.resolve(null) };
    }

    // The response is an HTML page: parse its metadata from the body we've
    // already fetched. This is deliberately NOT awaited so it runs alongside
    // the browser crawl. It must never reject (callers may await it late or
    // not at all) and any failure here must not lose the content type, as
    // that would regress the asset-vs-webpage routing decision.
    const metadata = (async () => {
      try {
        const htmlContent = await response.text();
        const { metadata: parsedMetadata } = await runParseSubprocess(
          htmlContent,
          response.url,
          jobId,
          abortSignal,
          { metadataOnly: true },
        );
        if (
          isLikelyChallengePage({ title: parsedMetadata.title, htmlContent })
        ) {
          log.info(
            `The content-type probe response for the url ${truncateUrl(url)} looks like a bot-challenge page; ignoring its metadata`,
          );
          addLogFields<"crawlerWorker.run">({
            "crawler.probe.metadata": "challenge_page",
          });
          return null;
        }
        log.info(
          `Extracted page metadata from the content-type probe for the url ${truncateUrl(url)}`,
        );
        addLogFields<"crawlerWorker.run">({
          "crawler.probe.metadata": "extracted",
        });
        return parsedMetadata;
      } catch (e) {
        log.warn(
          `Failed to extract page metadata from the content-type probe for the url ${truncateUrl(url)}: ${e}`,
        );
        addLogFields<"crawlerWorker.run">({
          "crawler.probe.metadata": "failed",
        });
        return null;
      }
    })();
    return { contentType, metadata };
  },
);

// Exported for the adhoc crawl CLI (scripts/crawlAdhoc.ts).
export const crawlPage = traced(
  "crawlPage",
  async (
    ctx: CrawlContext,
    forceStorePdf: boolean,
  ): Promise<CrawlPageResult> => {
    const { url, jobId, abortSignal, runProxy, log } = ctx;
    setSpanAttributes({ "crawler.forceStorePdf": forceStorePdf });

    if (!ctx.browserCrawlingEnabled) {
      return browserlessCrawlPage(ctx);
    }

    const browser = await getBrowserInstance();
    if (!browser) {
      return browserlessCrawlPage(ctx);
    }

    const proxyConfig = getPlaywrightProxyConfig(runProxy);
    const userAgent = await getBrowserUserAgent(browser);
    const isRunningInProxyContext =
      proxyConfig !== undefined &&
      !matchesNoProxy(url, proxyConfig.bypass?.split(",") ?? []);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent,
      // A UTC browser behind a proxy that geolocates elsewhere is a
      // strong bot signal; this should match the proxy's location.
      timezoneId: serverConfig.crawler.browserTimezone,
      proxy: proxyConfig,
      serviceWorkers: "block",
    });

    trackContext(jobId, context);
    let page: Page | undefined;
    try {
      const globalCookies = getGlobalCookies();
      if (globalCookies.length > 0) {
        await context.addCookies(globalCookies);
        log.info(`Cookies successfully loaded into browser context`);
      }

      const setup = await setupPage(ctx, context, proxyConfig);
      page = setup.page;

      // page is guaranteed to be assigned here; alias to a const for
      // TypeScript narrowing so the rest of the try block sees `Page`.
      const activePage = page;

      // Navigate to the target URL
      const navigationValidation = await validateUrl(
        url,
        isRunningInProxyContext,
      );
      if (!navigationValidation.ok) {
        throw new Error(
          `Disallowed navigation target "${truncateUrl(url)}": ${navigationValidation.reason}`,
        );
      }
      const targetUrl = navigationValidation.url.toString();
      // Tracks the status of the latest main-frame document, which differs
      // from the initial navigation's when a bot challenge clears and
      // reloads into the real page.
      let mainDocumentStatus: number | undefined;
      activePage.on("response", (res) => {
        if (
          res.request().isNavigationRequest() &&
          res.frame() === activePage.mainFrame()
        ) {
          mainDocumentStatus = res.status();
        }
      });
      log.info(`Navigating to "${targetUrl}"`);
      const response = await span("crawlPage.navigate", () =>
        raceWith(
          activePage.goto(targetUrl, {
            timeout: serverConfig.crawler.navigateTimeoutSec * 1000,
            waitUntil: "domcontentloaded",
          }),
          abortRaceResolve(abortSignal, null),
        ),
      );
      setSpanAttributes({ "crawler.statusCode": response?.status() ?? 0 });

      log.info(
        `Successfully navigated to "${targetUrl}". Waiting for the page to load ...`,
      );

      // Wait until network is relatively idle or timeout after 5 seconds
      const pageLoad = span("crawlPage.waitForLoadState", () =>
        raceWith<unknown>(
          activePage
            .waitForLoadState("networkidle", { timeout: 5000 })
            .catch(() => ({})),
          timeoutRace<unknown>(5000, () => undefined),
          abortRace(abortSignal),
        ),
      );

      await waitForPageLoadAndAutoconsent(
        activePage,
        pageLoad,
        setup.autoconsentEnabled,
        abortSignal,
      );
      abortSignal.throwIfAborted();

      await span("crawlPage.waitForChallenge", () =>
        waitForChallengeToClear(
          activePage,
          mainDocumentStatus ?? response?.status() ?? 0,
          jobId,
          abortSignal,
        ),
      );

      log.info(`Finished waiting for the page to load.`);

      const [htmlContent, screenshot, pdf] = await capturePageAssets(
        ctx,
        activePage,
        forceStorePdf,
      );

      return {
        htmlContent,
        statusCode: mainDocumentStatus ?? response?.status() ?? 0,
        screenshot,
        pdf,
        url: activePage.url(),
      };
    } finally {
      await closePageAndContext(ctx, page, context, browser);
    }
  },
);

async function getBrowserInstance(): Promise<Browser | undefined> {
  return serverConfig.crawler.browserConnectOnDemand
    ? startBrowserInstance()
    : getGlobalBrowser();
}

/**
 * Renders a precrawled archive (e.g. a SingleFile capture uploaded by the
 * browser extension) offline and screenshots it. The archive is untrusted
 * user-provided HTML, so JavaScript is disabled and every network request is
 * blocked; SingleFile archives inline their resources so they render fine
 * without the network. Returns undefined when screenshots are disabled, the
 * user can't use the browser, or no browser is available.
 *
 * The screenshot is best-effort: processing the archive itself doesn't need a
 * browser, so browser failures are logged and skipped rather than failing the
 * crawl. Aborts still propagate.
 */
const screenshotPrecrawledArchive = traced(
  "screenshotPrecrawledArchive",
  async (
    ctx: CrawlContext,
    htmlContent: string,
  ): Promise<Buffer | undefined> => {
    const { abortSignal, log } = ctx;
    if (!serverConfig.crawler.storeScreenshot || !ctx.browserCrawlingEnabled) {
      return undefined;
    }
    const { data: screenshot, error } = await tryCatch(
      renderPrecrawledArchiveScreenshot(ctx, htmlContent),
    );
    abortSignal.throwIfAborted();
    if (error) {
      log.warn(
        `Failed to screenshot the precrawled archive. Skipping the screenshot: ${error}`,
      );
      return undefined;
    }
    return screenshot;
  },
);

async function renderPrecrawledArchiveScreenshot(
  ctx: CrawlContext,
  htmlContent: string,
): Promise<Buffer | undefined> {
  const { jobId, abortSignal, log } = ctx;
  const browser = await getBrowserInstance();
  if (!browser) {
    log.info(
      `No browser available. Skipping the screenshot of the precrawled archive.`,
    );
    return undefined;
  }

  let context: BrowserContext;
  try {
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: false,
      serviceWorkers: "block",
      offline: true,
    });
  } catch (e) {
    // closePageAndContext would close an on-demand browser, but it's never
    // reached without a context.
    if (serverConfig.crawler.browserConnectOnDemand) {
      await browser.close().catch((closeError: unknown) => {
        log.warn(`browser.close() failed: ${closeError}`);
      });
    }
    throw e;
  }
  trackContext(jobId, context);
  let page: Page | undefined;
  try {
    page = await context.newPage();
    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (requestUrl.startsWith("data:") || requestUrl === "about:blank") {
        await route.fallback();
        return;
      }
      await route.abort("blockedbyclient");
    });

    const { error: loadError } = await tryCatch(
      raceWith(
        page.setContent(htmlContent, {
          timeout: serverConfig.crawler.navigateTimeoutSec * 1000,
          waitUntil: "load",
        }),
        abortRace(abortSignal),
      ),
    );
    abortSignal.throwIfAborted();
    if (loadError) {
      // A partially rendered page still makes a useful screenshot.
      log.warn(
        `Precrawled archive didn't fully load before screenshotting: ${loadError}`,
      );
    }

    return await captureScreenshot(ctx, page);
  } finally {
    await closePageAndContext(ctx, page, context, browser);
  }
}

/**
 * Creates and configures the page: redirect guard, adblocking, dialog
 * auto-dismissal, media/SSRF request blocking, and abort wiring.
 */
async function setupPage(
  ctx: CrawlContext,
  context: BrowserContext,
  proxyConfig: BrowserContextOptions["proxy"],
): Promise<{ page: Page; autoconsentEnabled: boolean }> {
  const { jobId, abortSignal, log } = ctx;
  // Create a new page in the context
  const nextPage = await context.newPage();
  const cdpSession = await installRedirectGuard(
    context,
    nextPage,
    jobId,
    proxyConfig,
  );

  // Apply ad blocking
  const globalBlocker = getGlobalBlocker();
  if (globalBlocker) {
    await globalBlocker.enableBlockingInPage(nextPage);
  }

  // Auto-dismiss JavaScript dialogs (alert, confirm, prompt)
  // to prevent pages from hanging during crawl.
  nextPage.on("dialog", (dialog) => {
    dialog.dismiss().catch(() => {
      // Ignore errors — the dialog may have already been closed.
    });
  });

  // Block audio/video resources and disallowed sub-requests
  await nextPage.route("**/*", async (route) => {
    if (abortSignal.aborted) {
      await route.abort("aborted");
      return;
    }
    const request = route.request();
    const resourceType = request.resourceType();

    // Block audio/video resources
    if (
      resourceType === "media" ||
      request.headers()["content-type"]?.includes("video/") ||
      request.headers()["content-type"]?.includes("audio/")
    ) {
      await route.abort("aborted");
      return;
    }

    const requestUrl = request.url();
    const requestIsRunningInProxyContext =
      proxyConfig !== undefined &&
      !matchesNoProxy(requestUrl, proxyConfig.bypass?.split(",") ?? []);
    if (requestUrl.startsWith("http://") || requestUrl.startsWith("https://")) {
      const validation = await validateUrl(
        requestUrl,
        requestIsRunningInProxyContext,
      );
      if (!validation.ok) {
        log.warn(
          `Blocking sub-request to disallowed URL "${requestUrl}": ${validation.reason}`,
        );
        await route.abort("blockedbyclient");
        return;
      }
    }

    // Continue with other requests
    await route.fallback();
  });

  // Install autoconsent AFTER the redirect guard and SSRF request router
  // are in place (conservative ordering; it injects scripts). No-op unless
  // enabled and the bundle loaded.
  const autoconsentEnabled = await installAutoconsent(nextPage, jobId);

  // On abort, immediately stop intercepting requests so that
  // in-flight route handlers don't block page/context closure.
  abortSignal.addEventListener(
    "abort",
    () => {
      cdpSession?.detach().catch(() => {
        // Ignore errors — the session may already be detached.
      });
      nextPage.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {
        // Ignore errors — the page may already be closed.
      });
    },
    { once: true },
  );

  return { page: nextPage, autoconsentEnabled };
}

/**
 * Captures a screenshot or PDF of the page. Failures and timeouts are logged
 * and reported as `undefined` since both are best-effort.
 */
function captureAsset(
  ctx: CrawlContext,
  kind: keyof typeof CAPTURED_ASSETS,
  capture: () => Promise<Buffer>,
): Promise<Buffer | undefined> {
  const { abortSignal, log } = ctx;
  const { captureSpanName, label } = CAPTURED_ASSETS[kind];
  return span(captureSpanName, async () => {
    const { data, error } = await tryCatch(
      raceWith<Buffer>(
        capture(),
        timeoutRace<Buffer>(
          serverConfig.crawler.screenshotTimeoutSec * 1000,
          () => {
            throw new Error(
              "TIMED_OUT, consider increasing CRAWLER_SCREENSHOT_TIMEOUT_SEC",
            );
          },
        ),
        abortRaceResolve(abortSignal, Buffer.from("")),
      ),
    );
    abortSignal.throwIfAborted();
    if (error) {
      log.warn(`Failed to capture the ${label}. Reason: ${error}`);
      return undefined;
    }
    setSpanAttributes({ "asset.size": data.byteLength });
    log.info(`Captured the ${label} (${data.byteLength} bytes)`);
    return data;
  });
}

function captureScreenshot(ctx: CrawlContext, page: Page) {
  return captureAsset(ctx, "screenshot", () =>
    page.screenshot({
      // If you change this, change the content type in CAPTURED_ASSETS too.
      type: "jpeg",
      fullPage: serverConfig.crawler.fullPageScreenshot,
      quality: 80,
    }),
  );
}

/**
 * Extracts the page HTML and (depending on config) captures a screenshot and
 * a PDF, all in parallel.
 */
const capturePageAssets = traced(
  "crawlPage.captureAssets",
  async (
    ctx: CrawlContext,
    activePage: Page,
    forceStorePdf: boolean,
  ): Promise<[string, Buffer | undefined, Buffer | undefined]> => {
    const { abortSignal, log } = ctx;
    const htmlPromise = activePage.content().then((content) => {
      abortSignal.throwIfAborted();
      log.info(`Successfully fetched the page content.`);
      return content;
    });

    const screenshotPromise = serverConfig.crawler.storeScreenshot
      ? captureScreenshot(ctx, activePage)
      : Promise.resolve(undefined);

    const pdfPromise =
      serverConfig.crawler.storePdf || forceStorePdf
        ? captureAsset(ctx, "pdf", () =>
            activePage.pdf({ format: "A4", printBackground: true }),
          )
        : Promise.resolve(undefined);

    const captureResults = await Promise.all([
      htmlPromise,
      screenshotPromise,
      pdfPromise,
    ] as const);
    abortSignal.throwIfAborted();
    return captureResults;
  },
);

/**
 * Closes the page and its context with timeouts so a hung close can't wedge
 * the job; contexts that fail to close stay tracked for the reaper. Also
 * closes the browser itself when it was connected on demand.
 */
const closePageAndContext = traced(
  "crawlPage.cleanup",
  async (
    ctx: CrawlContext,
    page: Page | undefined,
    context: BrowserContext,
    browser: Browser,
  ): Promise<void> => {
    const { jobId, log } = ctx;
    setSpanAttributes({ "crawler.cleanup.hasPage": !!page });

    // Explicitly close the page first (with timeout) to release resources
    // even if context.close() later hangs.
    if (page) {
      const pageToClose = page;
      const pageClosed = await raceWith<boolean>(
        pageToClose
          .close()
          .then(() => true)
          .catch((e: unknown) => {
            log.warn(`page.close() failed: ${e}`);
            return true;
          }),
        timeoutRace<boolean>(PAGE_CLOSE_TIMEOUT_MS, () => false),
      );
      setSpanAttributes({ "crawler.cleanup.pageClosed": pageClosed });
      if (!pageClosed) {
        log.warn(`page.close() timed out`);
      }
    }

    // Close the context (with timeout) to avoid hanging on in-flight ops.
    // Only remove from tracking if close actually succeeded; otherwise
    // the reaper will retry the close later.
    const contextClosed = await raceWith<boolean>(
      context
        .close()
        .then(() => true)
        .catch((e: unknown) => {
          log.warn(`context.close() failed: ${e}`);
          return true; // Error means it's likely already closed
        }),
      timeoutRace<boolean>(CONTEXT_CLOSE_TIMEOUT_MS, () => false),
    );
    setSpanAttributes({ "crawler.cleanup.contextClosed": contextClosed });

    if (contextClosed) {
      untrackContext(jobId);
    } else {
      log.warn(`context.close() timed out — leaving in active set for reaper`);
    }

    // Only close the browser if it was created on demand
    if (serverConfig.crawler.browserConnectOnDemand) {
      await browser
        .close()
        .then(() => {
          untrackContext(jobId);
        })
        .catch((e: unknown) => {
          log.warn(`browser.close() failed: ${e}`);
        });
    }
  },
);

const browserlessCrawlPage = traced(
  "browserlessCrawlPage",
  async (ctx: CrawlContext): Promise<CrawlPageResult> => {
    const { url, abortSignal, runProxy, log } = ctx;
    log.info(
      `Running in browserless mode. Will do a plain http request to "${truncateUrl(url)}". Screenshots will be disabled.`,
    );
    const response = await fetchWithProxy(
      url,
      {
        signal: AbortSignal.any([AbortSignal.timeout(5000), abortSignal]),
      },
      runProxy,
    );
    log.info(
      `Successfully fetched the content of "${truncateUrl(url)}". Status: ${response.status}, Size: ${response.size}`,
    );
    return {
      htmlContent: await response.text(),
      statusCode: response.status,
      screenshot: undefined,
      pdf: undefined,
      url: response.url,
    };
  },
);

async function fetchAsset(ctx: CrawlContext, url: string, fileType: string) {
  ctx.log.info(`Downloading ${fileType} from "${truncateUrl(url)}"`);
  const response = await fetchWithProxy(
    url,
    {
      signal: ctx.abortSignal,
    },
    ctx.runProxy,
  );
  if (!response.ok || response.body == null) {
    throw new Error(`Failed to download ${fileType}: ${response.status}`);
  }

  const contentType = normalizeContentType(
    response.headers.get("content-type"),
  );
  if (!contentType) {
    throw new Error("No content type in the response");
  }
  return { contentType, body: response.body };
}
