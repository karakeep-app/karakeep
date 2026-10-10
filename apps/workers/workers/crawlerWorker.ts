// The crawler worker. Read top-down: the queue wiring and runCrawler (the
// whole job) come first, then the steps in the order they run:
//  1. Before crawling: domain rate limit, and a probe that decides between an
//     asset bookmark (pdf/image) and a webpage, extracting early metadata.
//  2a. The URL is a file: download it and turn the bookmark into an asset.
//  2b. The URL is a webpage: fetch it in the browser (or use a precrawled
//      archive), parse it in a subprocess, and store metadata, content and
//      assets. The full-page archive runs last as it's the most failure-prone.
//  3. After crawling: enqueue inference, search, video and webhook jobs.
// The asset storage helpers are at the bottom.

import { promises as fs } from "fs";
import * as fsSync from "fs";
import * as path from "node:path";
import * as os from "os";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { dataUriToBuffer } from "data-uri-to-buffer";
import type { MimeBuffer } from "data-uri-to-buffer";
import { and, eq, sql } from "drizzle-orm";
import { execa } from "execa";
import {
  bookmarkCrawlLatencyHistogram,
  crawlerStatusCodeCounter,
  workerStatsCounter,
} from "metrics";
import {
  fetchWithProxy,
  getBookmarkDomain,
  matchesNoProxy,
  selectRunProxies,
  validateUrl,
} from "network";
import type { RunProxyConfig } from "network";
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
} from "utils";
import { withWorkerEventLog, withWorkerTracing } from "workerTracing";
import { getBookmarkDetails, updateAsset } from "workerUtils";

import type { AssetMetadata, ZCrawlLinkRequest } from "@karakeep/shared-server";
import type { ZReaderViewReason } from "@karakeep/shared/types/bookmarks";
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  users,
} from "@karakeep/db/schema";
import {
  addLogFields,
  ASSET_TYPES,
  AssetPreprocessingQueue,
  EmbeddingsQueue,
  getAssetSize,
  getTracer,
  IMAGE_ASSET_TYPES,
  newAssetId,
  OpenAIQueue,
  optimizeBannerImage,
  QuotaService,
  readAsset,
  saveAsset,
  saveAssetFromFile,
  setSpanAttributes,
  silentDeleteAsset,
  SUPPORTED_UPLOAD_ASSET_TYPES,
  triggerSearchReindex,
  VideoWorkerQueue,
  withSpan,
  zCrawlLinkRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import {
  DequeuedJob,
  DequeuedJobError,
  EnqueueOptions,
  getQueueClient,
  Queue,
  QueueRetryAfterError,
} from "@karakeep/shared/queueing";
import { getRateLimitClient } from "@karakeep/shared/ratelimiting";
import { tryCatch } from "@karakeep/shared/tryCatch";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { WebhooksService } from "@karakeep/trpc/models/webhooks.service";

import type { ParseSubprocessOutput } from "./utils/parseHtmlSubprocessIpc";
import {
  normalizeContentType,
  redactUrlCredentials,
  shouldRetryCrawlStatusCode,
  truncateUrl,
} from "./utils/crawlerUtils";
import {
  installAutoconsent,
  waitForPageLoadAndAutoconsent,
} from "./utils/autoconsent";
import { waitForChallengeToClear } from "./utils/botChallenge";
import {
  CONTEXT_CLOSE_TIMEOUT_MS,
  getBrowserUserAgent,
  getGlobalBlocker,
  getGlobalBrowser,
  getGlobalCookies,
  getPlaywrightProxyConfig,
  initializeBrowserEnvironment,
  PAGE_CLOSE_TIMEOUT_MS,
  startBrowserInstance,
  trackContext,
  untrackContext,
} from "./utils/browser";
import {
  isLikelyChallengePage,
  resolveMetadata,
} from "./utils/metadataResolver";
import { runParseSubprocess } from "./utils/parseSubprocess";
import { installRedirectGuard } from "./utils/redirectGuard";

const tracer = getTracer("@karakeep/workers");

// Runs fn in a "crawlerWorker.<name>" span, a child of the current span.
// Job-level attributes (job, bookmark, user) live on the root
// crawlerWorker.run span; child spans only add their own specifics.
function span<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return withSpan(tracer, `crawlerWorker.${name}`, {}, fn);
}

// Wraps fn so that every call runs in its own span (see span()).
function traced<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args) => span(name, () => fn(...args));
}

/**
 * What every step of a crawl needs to know about the job. Built once in
 * runCrawler and passed as the first argument to each step.
 */
export interface CrawlContext {
  jobId: string;
  bookmarkId: string;
  userId: string;
  /** The bookmark's URL, before any redirects. */
  url: string;
  abortSignal: AbortSignal;
  /** Picked once per run so that every request in the run uses the same proxy. */
  runProxy: RunProxyConfig;
  /**
   * False when the user has browser crawling disabled, in which case pages
   * are fetched over plain HTTP instead of with the browser.
   */
  browserCrawlingEnabled: boolean;
  log: CrawlLogger;
}

type CrawlLogger = Record<"info" | "warn" | "error", (message: string) => void>;

/** Logs with the "[Crawler][<jobId>]" prefix that all crawler log lines use. */
export function crawlLogger(jobId: string): CrawlLogger {
  const prefix = `[Crawler][${jobId}]`;
  return {
    info: (message) => logger.info(`${prefix} ${message}`),
    warn: (message) => logger.warn(`${prefix} ${message}`),
    error: (message) => logger.error(`${prefix} ${message}`),
  };
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

interface CrawlerRunResult {
  status: "completed";
}

export class CrawlerWorker {
  private static initPromise: Promise<void> | null = null;

  private static ensureInitialized() {
    if (!CrawlerWorker.initPromise) {
      CrawlerWorker.initPromise = initializeBrowserEnvironment();
    }
    return CrawlerWorker.initPromise;
  }

  // Boots the browser/adblocker/cookies without the queue runner. Used by the
  // adhoc crawl CLI (scripts/crawlAdhoc.ts).
  static async prepareForAdhoc(): Promise<void> {
    await CrawlerWorker.ensureInitialized();

    // The adhoc CLI exists to exercise the REAL browser path. When no browser is
    // reachable, crawlPage() silently falls back to a plain HTTP fetch
    // (browserlessCrawlPage), which would quietly corrupt A/B results with a run
    // that never executed JS/screenshots. Fail loudly instead. Two cases where
    // the fallback is silent: no browser is configured at all, and a
    // non-on-demand connection that failed to establish at init (globalBrowser
    // stays undefined). On-demand connections throw per-crawl, so those surface
    // as visible errors already.
    const hasBrowserBackend =
      !!serverConfig.crawler.browserWebUrl ||
      !!serverConfig.crawler.browserWebSocketUrl;
    if (!hasBrowserBackend) {
      throw new Error(
        "[adhoc] No browser backend configured — refusing to run. crawlPage() " +
          "would silently fall back to a plain HTTP fetch. Set BROWSER_WEB_URL " +
          "or BROWSER_WEBSOCKET_URL to a reachable Chrome.",
      );
    }
    if (!serverConfig.crawler.browserConnectOnDemand && !getGlobalBrowser()) {
      throw new Error(
        "[adhoc] Browser failed to connect — refusing to run. crawlPage() would " +
          "silently fall back to a plain HTTP fetch. Check that BROWSER_WEB_URL / " +
          "BROWSER_WEBSOCKET_URL points at a reachable Chrome.",
      );
    }
  }

  static async build(queue: Queue<ZCrawlLinkRequest>) {
    await CrawlerWorker.ensureInitialized();

    logger.info("Starting crawler worker ...");
    const worker = (await getQueueClient()).createRunner<
      ZCrawlLinkRequest,
      CrawlerRunResult
    >(
      queue,
      {
        run: withWorkerTracing(
          "crawlerWorker.run",
          withWorkerEventLog("crawlerWorker.run", (job) =>
            runCrawler(job, queue.opts.defaultJobArgs.numRetries),
          ),
        ),
        onComplete: async (job: DequeuedJob<ZCrawlLinkRequest>) => {
          workerStatsCounter.labels("crawler", "completed").inc();
          const jobId = job.id;
          logger.info(`[Crawler][${jobId}] Completed successfully`);
          const bookmarkId = job.data.bookmarkId;
          if (bookmarkId) {
            await db
              .update(bookmarkLinks)
              .set({
                crawlStatus: "success",
              })
              .where(eq(bookmarkLinks.id, bookmarkId));
          }
        },
        onError: async (job: DequeuedJobError<ZCrawlLinkRequest>) => {
          workerStatsCounter.labels("crawler", "failed").inc();
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("crawler", "failed_permanent").inc();
          }
          const jobId = job.id;
          logger.error(
            `[Crawler][${jobId}] Crawling job failed: ${job.error}\n${job.error.stack}`,
          );
          const bookmarkId = job.data?.bookmarkId;
          if (bookmarkId && job.numRetriesLeft == 0) {
            await db.transaction((tx) => {
              tx.update(bookmarkLinks)
                .set({
                  crawlStatus: "failure",
                })
                .where(eq(bookmarkLinks.id, bookmarkId))
                .run();
              tx.update(bookmarks)
                .set({
                  taggingStatus: null,
                })
                .where(
                  and(
                    eq(bookmarks.id, bookmarkId),
                    eq(bookmarks.taggingStatus, "pending"),
                  ),
                )
                .run();
              tx.update(bookmarks)
                .set({
                  summarizationStatus: null,
                })
                .where(
                  and(
                    eq(bookmarks.id, bookmarkId),
                    eq(bookmarks.summarizationStatus, "pending"),
                  ),
                )
                .run();
              tx.update(bookmarks)
                .set({
                  embeddingStatus: null,
                })
                .where(
                  and(
                    eq(bookmarks.id, bookmarkId),
                    eq(bookmarks.embeddingStatus, "pending"),
                  ),
                )
                .run();
            });
          }
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.crawler.jobTimeoutSec,
        concurrency: serverConfig.crawler.numWorkers,
      },
    );

    return worker;
  }
}

async function runCrawler(
  job: DequeuedJob<ZCrawlLinkRequest>,
  maxRetries: number,
): Promise<CrawlerRunResult> {
  const jobId = `${job.id}:${job.runNumber}`;
  const log = crawlLogger(jobId);
  const numRetriesLeft = Math.max(maxRetries - job.runNumber, 0);

  const request = zCrawlLinkRequestSchema.safeParse(job.data);
  if (!request.success) {
    log.error(`Got malformed job request: ${request.error.toString()}`);
    return { status: "completed" };
  }

  const { bookmarkId, archiveFullPage, storePdf } = request.data;
  // Add the bookmark id before any database or network work so failed and
  // aborted crawler events remain discoverable by bookmark id.
  addLogFields<"crawlerWorker.run">({
    "bookmark.id": bookmarkId,
  });
  const {
    url,
    userId,
    createdAt,
    crawledAt,
    screenshotAssetId: oldScreenshotAssetId,
    pdfAssetId: oldPdfAssetId,
    imageAssetId: oldImageAssetId,
    fullPageArchiveAssetId: oldFullPageArchiveAssetId,
    contentAssetId: oldContentAssetId,
    precrawledArchiveAssetId,
    probeMetadataAt,
  } = await getBookmarkDetails(bookmarkId);

  const userData = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { browserCrawlingEnabled: true },
  });
  if (!userData) {
    log.error(`User ${userId} not found`);
    throw new Error(`User ${userId} not found`);
  }

  const runProxy = selectRunProxies();
  const ctx: CrawlContext = {
    jobId,
    bookmarkId,
    userId,
    url,
    abortSignal: job.abortSignal,
    runProxy,
    // null means the user has no explicit setting, which defaults to enabled.
    browserCrawlingEnabled: userData.browserCrawlingEnabled !== false,
    log,
  };

  addLogFields<"crawlerWorker.run">({
    "user.id": userId,
    "crawler.url": url,
    "crawler.domain": getBookmarkDomain(url),
    "crawler.proxy": redactUrlCredentials(
      runProxy.httpsProxy ?? runProxy.httpProxy ?? "",
    ),
  });
  setSpanAttributes({
    "crawler.archiveFullPage": archiveFullPage,
    "bookmark.id": bookmarkId,
    "bookmark.url": url,
    "bookmark.domain": getBookmarkDomain(url),
    "user.id": userId,
    "crawler.proxy": redactUrlCredentials(
      runProxy.httpsProxy ?? runProxy.httpProxy ?? "",
    ),
  });

  log.info(`Will crawl "${truncateUrl(url)}" for link with id "${bookmarkId}"`);
  await checkDomainRateLimit(ctx);

  if (precrawledArchiveAssetId) {
    log.info(
      `Skipped fetching content-type for the url ${url} as precrawledArchiveAssetId exists`,
    );
  }
  // Retry runs re-probe for the content type, but if a previous run already
  // extracted and stored the probe metadata (probeMetadataAt), don't re-fetch
  // it — reload it from the bookmark row instead.
  const reuseStoredProbeMetadata =
    job.runNumber > 0 && probeMetadataAt !== null;
  const { contentType, metadata: probeMetadata }: UrlProbeResult =
    precrawledArchiveAssetId
      ? { contentType: ASSET_TYPES.TEXT_HTML, metadata: Promise.resolve(null) }
      : await getContentTypeAndMetadata(ctx, {
          skipMetadataExtraction: reuseStoredProbeMetadata,
        });
  job.abortSignal.throwIfAborted();

  // Link bookmarks get transformed into asset bookmarks if they point to a supported asset instead of a webpage
  const isPdf = contentType === ASSET_TYPES.APPLICATION_PDF;

  if (isPdf) {
    await handleAsAssetBookmark(ctx, "pdf");
  } else if (
    contentType &&
    IMAGE_ASSET_TYPES.has(contentType) &&
    SUPPORTED_UPLOAD_ASSET_TYPES.has(contentType)
  ) {
    await handleAsAssetBookmark(ctx, "image");
  } else {
    // Chain the early metadata write onto the (still running) probe
    // extraction so a title/thumbnail lands as soon as it's ready, while the
    // browser crawl proceeds in parallel. crawlAndParseUrl awaits this same
    // promise before its own metadata write, so within this attempt the
    // early write always precedes the final merged one. Across attempts the
    // ordering can't be relied on (a failed attempt's write may fire after a
    // retry finished) — that case is guarded by the write itself being
    // fill-only (see writeProbeMetadata). On retry runs where the probe
    // metadata was already stored, reload it from the bookmark row instead.
    // Never rejects.
    const probeMetadataPromise = reuseStoredProbeMetadata
      ? loadStoredProbeMetadata(ctx)
      : probeMetadata.then(async (metadata) => {
          if (metadata) {
            const { error } = await tryCatch(writeProbeMetadata(ctx, metadata));
            if (error) {
              log.warn(`Failed to write early probe metadata: ${error}`);
            }
          }
          return metadata;
        });
    const page = await crawlAndParseUrl(ctx, {
      oldAssets: {
        screenshotAssetId: oldScreenshotAssetId,
        pdfAssetId: oldPdfAssetId,
        imageAssetId: oldImageAssetId,
        contentAssetId: oldContentAssetId,
      },
      precrawledArchiveAssetId,
      forceStorePdf: storePdf ?? false,
      numRetriesLeft,
      probeMetadataPromise,
    });

    await enqueuePostCrawlJobs(ctx, job);

    // Do the archival as a separate last step as it has the potential for failure
    if (
      !precrawledArchiveAssetId &&
      (serverConfig.crawler.fullPageArchive || archiveFullPage)
    ) {
      await storeFullPageArchive(
        ctx,
        page.htmlContent,
        page.url,
        oldFullPageArchiveAssetId,
      );
    }
  }

  // Record the latency from bookmark creation to crawl completion.
  // Only for first-time, high-priority crawls (excludes recrawls and imports).
  if (crawledAt === null && job.priority === 0) {
    const latencySeconds = (Date.now() - createdAt.getTime()) / 1000;
    bookmarkCrawlLatencyHistogram.observe(latencySeconds);
  }

  return { status: "completed" };
}

// ---------------------------------------------------------------------------
// 1. Before crawling
// ---------------------------------------------------------------------------

/**
 * Checks if the domain should be rate limited and throws QueueRetryAfterError if needed.
 * @throws {QueueRetryAfterError} if the domain is rate limited
 */
async function checkDomainRateLimit(ctx: CrawlContext): Promise<void> {
  const { url, log } = ctx;
  const crawlerDomainRateLimitConfig = serverConfig.crawler.domainRatelimiting;
  if (!crawlerDomainRateLimitConfig) {
    return;
  }

  const rateLimitClient = await getRateLimitClient();
  if (!rateLimitClient) {
    return;
  }

  const hostname = new URL(url).hostname;
  const rateLimitResult = await rateLimitClient.checkRateLimit(
    {
      name: "domain-ratelimit",
      maxRequests: crawlerDomainRateLimitConfig.maxRequests,
      windowMs: crawlerDomainRateLimitConfig.windowMs,
    },
    hostname,
  );

  if (!rateLimitResult.allowed) {
    const resetInSeconds = rateLimitResult.resetInSeconds;
    // Add jitter to prevent thundering herd: +40% random variation
    const jitterFactor = 1.0 + Math.random() * 0.4; // Random value between 1.0 and 1.4
    const delayMs = Math.floor(resetInSeconds * 1000 * jitterFactor);
    log.info(
      `Domain "${hostname}" is rate limited. Will retry in ${(delayMs / 1000).toFixed(2)} seconds (with jitter).`,
    );
    throw new QueueRetryAfterError(
      `Domain "${hostname}" is rate limited`,
      delayMs,
    );
  }
}

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

interface UrlProbeResult {
  contentType: string | null;
  /**
   * Resolves with the page's preview metadata (or null). The extraction runs
   * in the background so it can overlap with the browser crawl — await it
   * only when the metadata is actually needed. Never rejects.
   */
  metadata: Promise<ParseSubprocessOutput["metadata"] | null>;
}

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

/**
 * Writes the preview metadata extracted by the pre-crawl probe so the bookmark
 * gets a title/thumbnail before the (slow) browser render finishes.
 *
 * The write is strictly fill-only: each field is wrapped in
 * COALESCE(NULLIF(existing, ''), new) so it can only populate fields that are
 * currently empty and never override an existing value. This matters because
 * the probe extraction runs detached from the crawl attempt's lifecycle — if
 * an attempt fails early, this write can fire after a *retry* (possibly on
 * another worker) has already stored its final metadata, and it must not
 * clobber it. The post-render metadata write refines these values within the
 * owning attempt.
 */
async function writeProbeMetadata(
  ctx: CrawlContext,
  metadata: ParseSubprocessOutput["metadata"],
) {
  const { bookmarkId, log } = ctx;
  // Don't store data URIs as they're not valid URLs and are usually quite large
  const image =
    metadata.image && !metadata.image.startsWith("data:")
      ? metadata.image
      : null;
  if (!metadata.title && !metadata.description && !image && !metadata.logo) {
    return;
  }
  await db
    .update(bookmarkLinks)
    .set({
      ...(metadata.title
        ? {
            title: sql`COALESCE(NULLIF(${bookmarkLinks.title}, ''), ${metadata.title})`,
          }
        : {}),
      ...(metadata.description
        ? {
            description: sql`COALESCE(NULLIF(${bookmarkLinks.description}, ''), ${metadata.description})`,
          }
        : {}),
      ...(image
        ? {
            imageUrl: sql`COALESCE(NULLIF(${bookmarkLinks.imageUrl}, ''), ${image})`,
          }
        : {}),
      ...(metadata.logo
        ? {
            favicon: sql`COALESCE(NULLIF(${bookmarkLinks.favicon}, ''), ${metadata.logo})`,
          }
        : {}),
      // Also record that the probe metadata has been fetched and stored, so
      // crawl retries can skip re-fetching it (see loadStoredProbeMetadata).
      probeMetadataAt: new Date(),
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
  log.info(`Wrote early metadata from the content-type probe.`);
}

/**
 * Reloads previously stored probe metadata from the bookmark row. Used on
 * crawl retries (where `probeMetadataAt` shows a probe already succeeded)
 * instead of re-fetching and re-parsing the page, so the blocked-render merge
 * protection keeps working without the extra fetch. Never rejects.
 */
async function loadStoredProbeMetadata(
  ctx: CrawlContext,
): Promise<ParseSubprocessOutput["metadata"] | null> {
  const { bookmarkId, log } = ctx;
  const { data: row, error } = await tryCatch(
    db.query.bookmarkLinks.findFirst({
      where: eq(bookmarkLinks.id, bookmarkId),
      columns: {
        title: true,
        description: true,
        imageUrl: true,
        favicon: true,
        author: true,
        publisher: true,
        datePublished: true,
        dateModified: true,
      },
    }),
  );
  if (error || !row) {
    if (error) {
      log.warn(`Failed to load stored probe metadata: ${error}`);
    }
    return null;
  }
  return {
    title: row.title,
    description: row.description,
    image: row.imageUrl,
    logo: row.favicon,
    author: row.author,
    publisher: row.publisher,
    datePublished: row.datePublished?.toISOString() ?? null,
    dateModified: row.dateModified?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// 2a. The URL is a file (pdf/image)
// ---------------------------------------------------------------------------

/**
 * Downloads the asset from the URL and transforms the linkBookmark to an assetBookmark
 * @param url the url the user provided
 * @param assetType the type of the asset we're downloading
 * @param userId the id of the user
 * @param jobId the id of the job for logging
 * @param bookmarkId the id of the bookmark
 */
const handleAsAssetBookmark = traced(
  "handleAsAssetBookmark",
  async (ctx: CrawlContext, assetType: "image" | "pdf") => {
    const { url, userId, jobId, bookmarkId } = ctx;
    setSpanAttributes({ "asset.type": assetType });
    const downloaded = await downloadAndStoreFile(ctx, url, assetType);
    if (!downloaded) {
      // Unlike screenshots and banner images, this download is the crawl's
      // primary result. Without it the bookmark cannot be converted to an
      // asset and none of the preprocessing/inference jobs can run.
      throw new Error(
        `[Crawler][${jobId}] Failed to download required ${assetType} asset`,
      );
    }
    const fileName = path.basename(new URL(url).pathname);
    await db.transaction((trx) => {
      updateAsset(
        undefined,
        {
          id: downloaded.assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.BOOKMARK_ASSET,
          contentType: downloaded.contentType,
          size: downloaded.size,
          fileName,
        },
        trx,
      );
      trx
        .insert(bookmarkAssets)
        .values({
          id: bookmarkId,
          assetType,
          assetId: downloaded.assetId,
          content: null,
          fileName,
          sourceUrl: url,
        })
        .run();
      // Switch the type of the bookmark from LINK to ASSET
      trx
        .update(bookmarks)
        .set({ type: BookmarkTypes.ASSET })
        .where(eq(bookmarks.id, bookmarkId))
        .run();
      trx.delete(bookmarkLinks).where(eq(bookmarkLinks.id, bookmarkId)).run();
    });
    await AssetPreprocessingQueue.enqueue(
      {
        bookmarkId,
        fixMode: false,
      },
      {
        groupId: userId,
      },
    );
  },
);

// ---------------------------------------------------------------------------
// 2b. The URL is a webpage
// ---------------------------------------------------------------------------

type DBAssetType = typeof assets.$inferInsert;

interface CrawlAndParseUrlArgs {
  /** Asset ids from a previous crawl of this bookmark, replaced (and deleted) on success. */
  oldAssets: {
    screenshotAssetId: string | undefined;
    pdfAssetId: string | undefined;
    imageAssetId: string | undefined;
    contentAssetId: string | undefined;
  };
  precrawledArchiveAssetId: string | undefined;
  forceStorePdf: boolean;
  numRetriesLeft: number;
  probeMetadataPromise: Promise<ParseSubprocessOutput["metadata"] | null>;
}

/**
 * Crawls the url, parses it, and persists the bookmark's metadata, content,
 * and assets. Returns the rendered page's html and final url, which the
 * full-page archival (run later by the caller) works from.
 */
const crawlAndParseUrl = traced(
  "crawlAndParseUrl",
  async (
    ctx: CrawlContext,
    args: CrawlAndParseUrlArgs,
  ): Promise<{ htmlContent: string; url: string }> => {
    const { url, userId, jobId, bookmarkId, abortSignal, runProxy, log } = ctx;
    const {
      oldAssets,
      precrawledArchiveAssetId,
      forceStorePdf,
      numRetriesLeft,
      probeMetadataPromise,
    } = args;
    const sanitizedProxyUrl = redactUrlCredentials(
      runProxy.httpsProxy ?? runProxy.httpProxy ?? "",
    );

    setSpanAttributes({
      "crawler.forceStorePdf": forceStorePdf,
      "crawler.hasPrecrawledArchive": !!precrawledArchiveAssetId,
    });
    let result: {
      htmlContent: string;
      screenshot: Buffer | undefined;
      pdf: Buffer | undefined;
      statusCode: number | null;
      url: string;
    };

    if (precrawledArchiveAssetId) {
      log.info(
        `The page has been precrawled. Will use the precrawled archive instead.`,
      );
      const asset = await readAsset({
        userId,
        assetId: precrawledArchiveAssetId,
      });
      const htmlContent = asset.asset.toString();
      result = {
        htmlContent,
        screenshot: await screenshotPrecrawledArchive(ctx, htmlContent),
        pdf: undefined,
        statusCode: 200,
        url,
      };
    } else {
      result = await crawlPage(ctx, forceStorePdf);
    }
    abortSignal.throwIfAborted();

    const {
      htmlContent,
      screenshot,
      pdf,
      statusCode,
      url: browserUrl,
    } = result;

    // Track status code in Prometheus
    if (statusCode !== null) {
      crawlerStatusCodeCounter
        .labels(statusCode.toString(), sanitizedProxyUrl)
        .inc();
      setSpanAttributes({
        "crawler.statusCode": statusCode,
      });
    }
    addLogFields<"crawlerWorker.run">({
      "crawler.status_code": statusCode,
    });

    if (shouldRetryCrawlStatusCode(statusCode)) {
      if (numRetriesLeft > 0) {
        throw new Error(
          `[Crawler][${jobId}] Received status code ${statusCode}. Will retry crawl. Retries left: ${numRetriesLeft}`,
        );
      }
      log.info(
        `Received status code ${statusCode} on latest retry attempt. Proceeding without retry.`,
      );
    }

    const {
      metadata: renderMeta,
      readableContent: parsedReadableContent,
      readerViewAssessment,
    } = await runParseSubprocess(htmlContent, browserUrl, jobId, abortSignal);
    abortSignal.throwIfAborted();

    // The probe metadata extraction has been running alongside the crawl;
    // this is the point where it's needed. The promise never rejects and
    // all its underlying work is time-bounded.
    const probeMetadata = await probeMetadataPromise;
    abortSignal.throwIfAborted();

    // On the last retry attempt the crawl proceeds despite a blocked status
    // code, and some bot walls serve their challenge page with a 200; in
    // both cases don't let that page's metadata override clean values from
    // the preflight probe.
    const renderIsChallengePage = isLikelyChallengePage({
      title: renderMeta.title,
      htmlContent,
    });
    const renderBlocked =
      shouldRetryCrawlStatusCode(statusCode) || renderIsChallengePage;
    addLogFields<"crawlerWorker.run">({
      "crawler.render_blocked": renderBlocked,
    });
    if (renderBlocked && probeMetadata) {
      log.info(
        `The rendered page looks blocked (status ${statusCode}); preferring preflight probe metadata.`,
      );
    }
    const meta = resolveMetadata(renderMeta, probeMetadata, renderBlocked);
    const readerViewReasons: ZReaderViewReason[] | null = readerViewAssessment
      ? renderIsChallengePage &&
        !readerViewAssessment.reasons.includes("challenge_page")
        ? [...readerViewAssessment.reasons, "challenge_page"]
        : readerViewAssessment.reasons
      : null;

    const parseDate = (date: string | null | undefined) => {
      if (!date) {
        return null;
      }
      const parsed = new Date(date);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    // Phase 1: Write metadata immediately for fast user feedback.
    // Content and asset storage happen later and can be slow (banner
    // image download, screenshot/pdf upload, etc.).
    await db
      .update(bookmarkLinks)
      .set({
        title: meta.title,
        description: meta.description,
        // Don't store data URIs as they're not valid URLs and are usually quite large
        imageUrl: meta.image?.startsWith("data:") ? null : meta.image,
        favicon: meta.logo,
        crawlStatusCode: statusCode,
        author: meta.author,
        publisher: meta.publisher,
        datePublished: parseDate(meta.datePublished),
        dateModified: parseDate(meta.dateModified),
      })
      .where(eq(bookmarkLinks.id, bookmarkId));

    let readableContent = parsedReadableContent;

    const screenshotAssetInfo = await raceWith(
      storeCapturedAsset(ctx, "screenshot", screenshot),
      abortRace(abortSignal),
    );
    abortSignal.throwIfAborted();

    const pdfAssetInfo = await raceWith(
      storeCapturedAsset(ctx, "pdf", pdf),
      abortRace(abortSignal),
    );
    abortSignal.throwIfAborted();

    const htmlContentAssetInfo = await storeHtmlContent(
      ctx,
      readableContent?.content,
    );
    abortSignal.throwIfAborted();
    let imageAssetInfo: DBAssetType | null = null;
    if (meta.image && serverConfig.crawler.downloadBannerImage) {
      const banner = await downloadAndStoreBanner(ctx, meta.image);
      if (banner) {
        imageAssetInfo = {
          id: banner.assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_BANNER_IMAGE,
          contentType: banner.contentType,
          size: banner.size,
        };
      }
    }
    abortSignal.throwIfAborted();

    // Phase 2: Write content and asset references.
    // TODO(important): Restrict the size of content to store
    const assetIdsToDelete: (string | undefined)[] = [];
    const inlineHtmlContent =
      htmlContentAssetInfo.result === "store_inline"
        ? (readableContent?.content ?? null)
        : null;
    readableContent = null;
    await db.transaction((txn) => {
      txn
        .update(bookmarkLinks)
        .set({
          crawledAt: new Date(),
          htmlContent: inlineHtmlContent,
          contentAssetId:
            htmlContentAssetInfo.result === "stored"
              ? htmlContentAssetInfo.assetId
              : null,
          readerViewStatus: readerViewAssessment?.status ?? null,
          readerViewScore: readerViewAssessment?.score ?? null,
          readerViewReasons,
          readerViewClassifierVersion:
            readerViewAssessment?.classifierVersion ?? null,
        })
        .where(eq(bookmarkLinks.id, bookmarkId))
        .run();

      if (screenshotAssetInfo) {
        updateAsset(
          oldAssets.screenshotAssetId,
          {
            id: screenshotAssetInfo.assetId,
            bookmarkId,
            userId,
            assetType: AssetTypes.LINK_SCREENSHOT,
            contentType: screenshotAssetInfo.contentType,
            size: screenshotAssetInfo.size,
            fileName: screenshotAssetInfo.fileName,
          },
          txn,
        );
        assetIdsToDelete.push(oldAssets.screenshotAssetId);
      }
      if (pdfAssetInfo) {
        updateAsset(
          oldAssets.pdfAssetId,
          {
            id: pdfAssetInfo.assetId,
            bookmarkId,
            userId,
            assetType: AssetTypes.LINK_PDF,
            contentType: pdfAssetInfo.contentType,
            size: pdfAssetInfo.size,
            fileName: pdfAssetInfo.fileName,
          },
          txn,
        );
        assetIdsToDelete.push(oldAssets.pdfAssetId);
      }
      if (imageAssetInfo) {
        updateAsset(oldAssets.imageAssetId, imageAssetInfo, txn);
        assetIdsToDelete.push(oldAssets.imageAssetId);
      }
      if (htmlContentAssetInfo.result === "stored") {
        updateAsset(
          oldAssets.contentAssetId,
          {
            id: htmlContentAssetInfo.assetId,
            bookmarkId,
            userId,
            assetType: AssetTypes.LINK_HTML_CONTENT,
            contentType: ASSET_TYPES.TEXT_HTML,
            size: htmlContentAssetInfo.size,
            fileName: null,
          },
          txn,
        );
        assetIdsToDelete.push(oldAssets.contentAssetId);
      } else if (oldAssets.contentAssetId) {
        // Unlink the old content asset
        txn.delete(assets).where(eq(assets.id, oldAssets.contentAssetId)).run();
        assetIdsToDelete.push(oldAssets.contentAssetId);
      }
    });

    // Delete the old assets if any
    await Promise.all(
      assetIdsToDelete.map((assetId) => silentDeleteAsset(userId, assetId)),
    );

    return { htmlContent, url: browserUrl };
  },
);

/**
 * Archives the full page with monolith and stores it as the bookmark's
 * full-page archive, replacing (and deleting) the previous one.
 */
async function storeFullPageArchive(
  ctx: CrawlContext,
  htmlContent: string,
  url: string,
  oldAssetId: string | undefined,
): Promise<void> {
  const { bookmarkId, userId } = ctx;
  const archiveResult = await archiveWebpage(ctx, htmlContent, url);
  if (!archiveResult) {
    return;
  }
  const { assetId, size, contentType } = archiveResult;
  await db.transaction((txn) => {
    updateAsset(
      oldAssetId,
      {
        id: assetId,
        bookmarkId,
        userId,
        assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
        contentType,
        size,
        fileName: null,
      },
      txn,
    );
  });
  if (oldAssetId) {
    await silentDeleteAsset(userId, oldAssetId);
  }
}

interface CrawlPageResult {
  htmlContent: string;
  screenshot: Buffer | undefined;
  pdf: Buffer | undefined;
  statusCode: number;
  url: string;
}

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

// ---------------------------------------------------------------------------
// 3. After crawling
// ---------------------------------------------------------------------------

/**
 * Enqueues the follow-up work after a successful webpage crawl: inference
 * (tagging/summarization/embeddings), search reindexing, video download, and
 * the "crawled" webhook.
 */
async function enqueuePostCrawlJobs(
  ctx: CrawlContext,
  job: DequeuedJob<ZCrawlLinkRequest>,
): Promise<void> {
  const { bookmarkId, userId, url } = ctx;
  // Propagate priority to child jobs
  const enqueueOpts: EnqueueOptions = {
    priority: job.priority,
    groupId: userId,
  };

  // Enqueue openai job (if not set, assume it's true for backward compatibility)
  if (job.data.runInference !== false) {
    if (serverConfig.embedding.enableAutoIndexing) {
      await EmbeddingsQueue.enqueue(
        {
          bookmarkId,
          type: "embed",
          runTaggingOnComplete: true,
        },
        enqueueOpts,
      );
    } else {
      await OpenAIQueue.enqueue(
        {
          bookmarkId,
          type: "tag",
        },
        enqueueOpts,
      );
    }
    await OpenAIQueue.enqueue(
      {
        bookmarkId,
        type: "summarize",
      },
      enqueueOpts,
    );
  }

  // Update the search index
  await triggerSearchReindex(bookmarkId, enqueueOpts);

  if (serverConfig.crawler.downloadVideo) {
    // Trigger a potential download of a video from the URL
    await VideoWorkerQueue.enqueue(
      {
        bookmarkId,
        url,
      },
      enqueueOpts,
    );
  }

  // Trigger a webhook
  {
    const webhookService = new WebhooksService(db);
    await webhookService.triggerWebhook(
      bookmarkId,
      "crawled",
      userId,
      enqueueOpts,
    );
  }
}

// ---------------------------------------------------------------------------
// Asset storage: screenshots, PDFs, images, HTML content, archives
// ---------------------------------------------------------------------------

/**
 * Saves the buffer as a new asset if it fits in the user's storage quota.
 * Returns the new asset's id, or null (logged) when over quota.
 */
async function saveBufferAsset(
  ctx: CrawlContext,
  label: string,
  asset: Buffer,
  metadata: AssetMetadata,
): Promise<string | null> {
  const { data: quotaApproved, error: quotaError } = await tryCatch(
    QuotaService.checkStorageQuota(db, ctx.userId, asset.byteLength),
  );
  if (quotaError) {
    ctx.log.warn(
      `Skipping ${label} storage due to quota exceeded: ${quotaError.message}`,
    );
    return null;
  }
  const assetId = newAssetId();
  await saveAsset({
    userId: ctx.userId,
    assetId,
    metadata,
    asset,
    quotaApproved,
  });
  ctx.log.info(
    `Stored the ${label} as assetId: ${assetId} (${asset.byteLength} bytes)`,
  );
  return assetId;
}

const CAPTURED_ASSETS = {
  screenshot: {
    captureSpanName: "crawlPage.captureScreenshot",
    storeSpanName: "storeScreenshot",
    label: "screenshot",
    // Must match the format capturePageAssets takes the screenshot in.
    contentType: "image/jpeg",
    fileName: "screenshot.jpeg",
  },
  pdf: {
    captureSpanName: "crawlPage.capturePdf",
    storeSpanName: "storePdf",
    label: "PDF",
    contentType: "application/pdf",
    fileName: "page.pdf",
  },
} as const;

/** Stores a screenshot or PDF captured from the page, if within quota. */
function storeCapturedAsset(
  ctx: CrawlContext,
  kind: keyof typeof CAPTURED_ASSETS,
  data: Buffer | undefined,
) {
  const { storeSpanName, label, contentType, fileName } = CAPTURED_ASSETS[kind];
  return span(storeSpanName, async () => {
    setSpanAttributes({ "asset.size": data?.byteLength ?? 0 });
    if (!data) {
      ctx.log.info(`Skipping storing the ${label} as it's empty.`);
      return null;
    }

    const assetId = await saveBufferAsset(ctx, label, data, {
      contentType,
      fileName,
    });
    if (!assetId) {
      return null;
    }
    return { assetId, contentType, fileName, size: data.byteLength };
  });
}

/**
 * SingleFile / precrawled archives inline images as `data:` URIs, so the image
 * URL metascraper extracts can be a base64 blob rather than something fetchable
 * over the network. Decode it locally instead of failing on the unsupported
 * protocol.
 */
function decodeDataUriImage(ctx: CrawlContext, url: string) {
  const { log } = ctx;
  const maxBytes = serverConfig.maxAssetSizeMb * 1024 * 1024;

  // Guardrail 1: cap the size *before* decoding into memory. base64 encodes 3
  // bytes per 4 chars, so a URI longer than 4/3 the limit (plus header slack)
  // must decode past it; the exact check below handles the rest.
  if (url.length > Math.ceil((maxBytes * 4) / 3) + 1024) {
    log.warn(
      `Skipping data URI image: encoded size (${url.length} chars) exceeds maximum allowed size of ${serverConfig.maxAssetSizeMb}MB`,
    );
    return null;
  }

  let asset: MimeBuffer;
  try {
    asset = dataUriToBuffer(url);
  } catch (e) {
    log.error(`Failed to decode data URI image: ${e}`);
    return null;
  }

  // Guardrail 2: never trust the declared mediatype for anything but the raster
  // image types we actually serve as banners. Rejects svg/html/etc.;
  // saveAsset's SUPPORTED_ASSET_TYPES check is the backstop.
  const contentType = normalizeContentType(asset.type);
  if (!contentType || !IMAGE_ASSET_TYPES.has(contentType)) {
    log.warn(
      `Skipping data URI image with unsupported content type: ${contentType}`,
    );
    return null;
  }

  if (asset.byteLength > maxBytes) {
    log.warn(
      `Skipping data URI image: decoded size (${asset.byteLength} bytes) exceeds maximum allowed size of ${serverConfig.maxAssetSizeMb}MB`,
    );
    return null;
  }

  return { image: asset, contentType };
}

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

async function fetchImage(ctx: CrawlContext, url: string) {
  const { contentType, body } = await fetchAsset(ctx, url, "banner image");
  const maxBytes = serverConfig.maxAssetSizeMb * 1024 * 1024;
  // Grows in place as chunks arrive, so the banner is never held twice in memory.
  const buffer = new ArrayBuffer(0, { maxByteLength: maxBytes });
  const bytes = new Uint8Array(buffer);
  for await (const chunk of body) {
    ctx.abortSignal.throwIfAborted();
    const offset = buffer.byteLength;
    if (offset + chunk.length > maxBytes) {
      throw new Error(
        `Content length exceeds maximum allowed size: ${serverConfig.maxAssetSizeMb}MB`,
      );
    }
    buffer.resize(offset + chunk.length);
    bytes.set(Buffer.from(chunk), offset);
  }
  return { image: Buffer.from(buffer, 0, buffer.byteLength), contentType };
}

/**
 * Downloads the page's banner image and stores a downscaled webp version of it.
 * Banners are small, so unlike other downloads they're kept in memory instead
 * of going through a temp file.
 */
const downloadAndStoreBanner = traced(
  "downloadAndStoreBanner",
  async (ctx: CrawlContext, url: string) => {
    setSpanAttributes({
      "bookmark.url": url,
      "bookmark.domain": getBookmarkDomain(url),
    });
    try {
      const banner = url.startsWith("data:")
        ? decodeDataUriImage(ctx, url)
        : await fetchImage(ctx, url);
      if (!banner) {
        return null;
      }
      const toStore =
        (await optimizeBannerImage(banner.image, banner.contentType)) ?? banner;
      // The crawl might have timed out while converting the banner.
      ctx.abortSignal.throwIfAborted();
      const assetId = await saveBufferAsset(
        ctx,
        "banner image",
        toStore.image,
        { contentType: toStore.contentType },
      );
      if (!assetId) {
        return null;
      }
      return {
        assetId,
        contentType: toStore.contentType,
        size: toStore.image.byteLength,
      };
    } catch (e) {
      ctx.log.error(`Failed to download and store the banner image: ${e}`);
      // A crawler timeout aborts the job-wide signal. Do not turn that abort
      // into a best-effort download miss: the queue runner must observe it so
      // the crawl is retried and is not reported as successfully completed.
      ctx.abortSignal.throwIfAborted();
      return null;
    }
  },
);

const downloadAndStoreFile = traced(
  "downloadAndStoreFile",
  async (ctx: CrawlContext, url: string, fileType: string) => {
    const { userId, abortSignal, log } = ctx;
    setSpanAttributes({
      "bookmark.url": url,
      "bookmark.domain": getBookmarkDomain(url),
      "asset.type": fileType,
    });
    let assetPath: string | undefined;
    try {
      const { contentType, body } = await fetchAsset(ctx, url, fileType);

      const assetId = newAssetId();
      assetPath = path.join(os.tmpdir(), assetId);

      let bytesRead = 0;
      const contentLengthEnforcer = new Transform({
        transform(chunk, _, callback) {
          bytesRead += chunk.length;

          if (abortSignal.aborted) {
            callback(new Error("AbortError"));
          } else if (bytesRead > serverConfig.maxAssetSizeMb * 1024 * 1024) {
            callback(
              new Error(
                `Content length exceeds maximum allowed size: ${serverConfig.maxAssetSizeMb}MB`,
              ),
            );
          } else {
            callback(null, chunk); // pass data along unchanged
          }
        },
        flush(callback) {
          callback();
        },
      });

      await pipeline(
        body,
        contentLengthEnforcer,
        fsSync.createWriteStream(assetPath),
      );

      // Check storage quota before saving the asset
      const { data: quotaApproved, error: quotaError } = await tryCatch(
        QuotaService.checkStorageQuota(db, userId, bytesRead),
      );

      if (quotaError) {
        log.warn(
          `Skipping ${fileType} storage due to quota exceeded: ${quotaError.message}`,
        );
        return null;
      }

      await saveAssetFromFile({
        userId,
        assetId,
        metadata: { contentType },
        assetPath,
        quotaApproved,
      });

      log.info(
        `Downloaded ${fileType} as assetId: ${assetId} (${bytesRead} bytes)`,
      );

      return { assetId, userId, contentType, size: bytesRead };
    } catch (e) {
      log.error(`Failed to download and store ${fileType}: ${e}`);
      // A crawler timeout aborts the job-wide signal. Do not turn that abort
      // into a best-effort download miss: the queue runner must observe it so
      // the crawl is retried and is not reported as successfully completed.
      abortSignal.throwIfAborted();
      return null;
    } finally {
      if (assetPath) {
        await tryCatch(fs.unlink(assetPath));
      }
    }
  },
);

const archiveWebpage = traced(
  "archiveWebpage",
  async (ctx: CrawlContext, html: string, url: string) => {
    const { userId, abortSignal, runProxy, log } = ctx;
    log.info(`Will attempt to archive page ...`);

    {
      // Archival is a heavy operation, so we need to check if the user is within reasonable quota before proceeding
      const { error: quotaError } = await tryCatch(
        QuotaService.checkStorageQuota(db, userId, /* estimated size */ 1024),
      );
      if (quotaError) {
        log.warn(
          `Skipping archival as the user has exceeded their quota: ${quotaError.message}`,
        );
        return null;
      }
    }

    const assetId = newAssetId();
    const assetPath = path.join(os.tmpdir(), assetId);

    const res = await execa({
      input: html,
      cancelSignal: abortSignal,
      // Report failures through the result instead of throwing, so that they
      // are handled below and the temp file is cleaned up.
      reject: false,
      env: {
        https_proxy: runProxy.httpsProxy,
        http_proxy: runProxy.httpProxy,
        no_proxy: runProxy.noProxy?.join(","),
      },
    })("monolith", [
      "-",
      "-Ije",
      "-t",
      String(serverConfig.crawler.monolithTimeoutSec),
      ...serverConfig.crawler.monolithArguments,
      "-b",
      url,
      "-o",
      assetPath,
    ]);

    if (res.failed) {
      await tryCatch(fs.unlink(assetPath));
      // A job timeout must still fail the job so the crawl is retried rather
      // than reported as completed (see downloadAndStoreFile).
      abortSignal.throwIfAborted();
      log.error(`Failed to archive the page: ${res.shortMessage}`);
      return null;
    }

    const contentType = "text/html";

    // Get file size and check quota before saving
    const stats = await fs.stat(assetPath);
    const fileSize = stats.size;

    // Discard oversized archives: media-rich pages can produce 1GB+
    // monolith files that never render and only hang/crash browsers.
    // 0 (default) disables the limit.
    const maxArchiveSizeMb = serverConfig.crawler.fullPageArchiveMaxSizeMb;
    if (maxArchiveSizeMb > 0 && fileSize > maxArchiveSizeMb * 1024 * 1024) {
      log.warn(
        `Discarding page archive of ${fileSize} bytes as it exceeds CRAWLER_FULL_PAGE_ARCHIVE_MAX_SIZE_MB=${maxArchiveSizeMb}.`,
      );
      await tryCatch(fs.unlink(assetPath));
      return null;
    }

    const { data: quotaApproved, error: quotaError } = await tryCatch(
      QuotaService.checkStorageQuota(db, userId, fileSize),
    );

    if (quotaError) {
      log.warn(
        `Skipping page archive storage due to quota exceeded: ${quotaError.message}`,
      );
      await tryCatch(fs.unlink(assetPath));
      return null;
    }

    await saveAssetFromFile({
      userId,
      assetId,
      assetPath,
      metadata: {
        contentType,
      },
      quotaApproved,
    });

    log.info(`Done archiving the page as assetId: ${assetId}`);

    return {
      assetId,
      contentType,
      size: await getAssetSize({ userId, assetId }),
    };
  },
);

type StoreHtmlResult =
  | { result: "stored"; assetId: string; size: number }
  | { result: "store_inline" }
  | { result: "not_stored" };

const storeHtmlContent = traced(
  "storeHtmlContent",
  async (
    ctx: CrawlContext,
    htmlContent: string | undefined,
  ): Promise<StoreHtmlResult> => {
    const { log } = ctx;
    setSpanAttributes({
      "bookmark.content.size": htmlContent
        ? Buffer.byteLength(htmlContent, "utf8")
        : 0,
    });
    if (!htmlContent) {
      return { result: "not_stored" };
    }

    const contentSize = Buffer.byteLength(htmlContent, "utf8");

    // Only store in assets if content is >= 50KB
    if (contentSize < serverConfig.crawler.htmlContentSizeThreshold) {
      log.info(
        `HTML content size (${contentSize} bytes) is below threshold, storing inline`,
      );
      return { result: "store_inline" };
    }

    const assetId = await saveBufferAsset(
      ctx,
      "HTML content",
      Buffer.from(htmlContent, "utf8"),
      { contentType: ASSET_TYPES.TEXT_HTML, fileName: null },
    );
    if (!assetId) {
      return { result: "not_stored" };
    }
    return { result: "stored", assetId, size: contentSize };
  },
);
