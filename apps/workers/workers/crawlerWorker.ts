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
//
// Everything that talks to the crawled website (probing, fetching the page,
// parsing it, downloading assets and archiving) goes through a Crawler (see
// crawler/common.ts): the local one, or a remote crawler when
// CRAWLER_REMOTE_URL is set. What's left here reads and writes the database
// and the asset store.

import { promises as fs } from "fs";
import * as fsSync from "fs";
import * as path from "node:path";
import * as os from "os";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { dataUriToBuffer } from "data-uri-to-buffer";
import type { MimeBuffer } from "data-uri-to-buffer";
import { and, eq, sql } from "drizzle-orm";

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

import type { CrawlContext, Crawler, UrlProbeResult } from "./crawler/common";
import type { ParseSubprocessOutput } from "./utils/parseHtmlSubprocessIpc";
import { CAPTURED_ASSETS, crawlLogger, span, traced } from "./crawler/common";
import { localCrawler } from "./crawler/localCrawler";
import { remoteCrawler } from "./crawler/remoteCrawler";
import {
  bookmarkCrawlLatencyHistogram,
  crawlerStatusCodeCounter,
  workerStatsCounter,
} from "../metrics";
import { getBookmarkDomain, selectRunProxies } from "../network";
import { abortRace, raceWith } from "../utils";
import { withWorkerEventLog, withWorkerTracing } from "../workerTracing";
import { getBookmarkDetails, updateAsset } from "../workerUtils";
import { getGlobalBrowser } from "./utils/browser";
import {
  normalizeContentType,
  redactUrlCredentials,
  shouldRetryCrawlStatusCode,
  truncateUrl,
  withDownloadTimeout,
} from "./utils/crawlerUtils";
import {
  extractHtmlTitle,
  isLikelyChallengePage,
  resolveMetadata,
} from "./utils/metadataResolver";

const crawler: Crawler = serverConfig.crawler.remote.url
  ? remoteCrawler
  : localCrawler;

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

interface CrawlerRunResult {
  status: "completed";
}

export class CrawlerWorker {
  // Boots the browser/adblocker/cookies without the queue runner. Used by the
  // adhoc crawl CLI (scripts/crawlAdhoc.ts).
  static async prepareForAdhoc(): Promise<void> {
    await localCrawler.init();

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
    await crawler.init();

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
          // Offline copy captures don't touch the bookmark's crawl state.
          if (bookmarkId && !job.data.offlineCopiesOnly) {
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
          if (
            bookmarkId &&
            job.numRetriesLeft == 0 &&
            !job.data?.offlineCopiesOnly
          ) {
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

  const { bookmarkId, archiveFullPage, storePdf, offlineCopiesOnly } =
    request.data;
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
    "crawler.offlineCopiesOnly": offlineCopiesOnly,
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

  if (offlineCopiesOnly) {
    await storeOfflineCopies(ctx, {
      archiveFullPage,
      storePdf,
      precrawledArchiveAssetId,
      oldPdfAssetId,
      oldFullPageArchiveAssetId,
      numRetriesLeft,
    });
    return { status: "completed" };
  }

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
      : await crawler.getContentTypeAndMetadata(ctx, {
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
    const { userId, jobId, bookmarkId, abortSignal, runProxy, log } = ctx;
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
    let precrawledHtml: string | undefined;
    if (precrawledArchiveAssetId) {
      log.info(
        `The page has been precrawled. Will use the precrawled archive instead.`,
      );
      const asset = await readAsset({
        userId,
        assetId: precrawledArchiveAssetId,
      });
      precrawledHtml = asset.asset.toString();
    }
    const result = await crawler.fetchPage(ctx, {
      forceStorePdf,
      precrawledHtml,
      skipParseOnRetryableStatus: numRetriesLeft > 0,
    });
    abortSignal.throwIfAborted();

    const {
      htmlContent,
      screenshot,
      pdf,
      statusCode,
      url: browserUrl,
      parsed,
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

    // fetchPage only skips the parse for the retryable status codes above.
    if (!parsed) {
      throw new Error(`[Crawler][${jobId}] The page wasn't parsed`);
    }
    const {
      metadata: renderMeta,
      readableContent: parsedReadableContent,
      readerViewAssessment,
    } = parsed;

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

interface StoreOfflineCopiesArgs {
  archiveFullPage: boolean;
  storePdf: boolean;
  precrawledArchiveAssetId: string | undefined;
  /** Replaced (and deleted) when a new copy is stored. */
  oldPdfAssetId: string | undefined;
  oldFullPageArchiveAssetId: string | undefined;
  numRetriesLeft: number;
}

/**
 * Captures only the offline copies the user asked for (a PDF and/or a
 * full-page archive) from a fresh fetch of the page. Unlike a recrawl, the
 * bookmark's metadata, content, screenshot and crawl status are left as they
 * are, and no post-crawl jobs (inference, reindexing, webhooks) are enqueued.
 */
const storeOfflineCopies = traced(
  "storeOfflineCopies",
  async (ctx: CrawlContext, args: StoreOfflineCopiesArgs): Promise<void> => {
    const { bookmarkId, userId, jobId, abortSignal, runProxy, log } = ctx;
    const storePdf = args.storePdf;
    // A precrawled archive is already the bookmark's offline archive, and the
    // regular crawl doesn't archive those bookmarks either.
    const archiveFullPage =
      args.archiveFullPage && !args.precrawledArchiveAssetId;
    if (args.archiveFullPage && !archiveFullPage) {
      log.info(
        `Skipping the full page archive as the bookmark has a precrawled archive.`,
      );
    }
    if (!storePdf && !archiveFullPage) {
      return;
    }

    const page = await crawler.fetchPage(ctx, {
      forceStorePdf: storePdf,
      skipParseOnRetryableStatus: true,
      skipScreenshot: true,
      skipPdf: !storePdf,
      skipParse: true,
    });
    abortSignal.throwIfAborted();

    crawlerStatusCodeCounter
      .labels(
        page.statusCode.toString(),
        redactUrlCredentials(runProxy.httpsProxy ?? runProxy.httpProxy ?? ""),
      )
      .inc();
    addLogFields<"crawlerWorker.run">({
      "crawler.status_code": page.statusCode,
    });

    // Unlike a regular crawl, there's nothing worth keeping from a blocked
    // page, and storing it would replace a good copy from an earlier capture.
    if (
      shouldRetryCrawlStatusCode(page.statusCode) ||
      isLikelyChallengePage({
        // The page isn't parsed, so read the title straight from the html.
        title: extractHtmlTitle(page.htmlContent),
        htmlContent: page.htmlContent,
      })
    ) {
      throw new Error(
        `[Crawler][${jobId}] The page looks blocked (status code ${page.statusCode}). Not storing offline copies.${args.numRetriesLeft > 0 ? ` Will retry. Retries left: ${args.numRetriesLeft}` : ""}`,
      );
    }

    if (storePdf) {
      const pdfAssetInfo = await raceWith(
        storeCapturedAsset(ctx, "pdf", page.pdf),
        abortRace(abortSignal),
      );
      abortSignal.throwIfAborted();
      if (pdfAssetInfo) {
        await db.transaction((txn) => {
          updateAsset(
            args.oldPdfAssetId,
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
        });
        if (args.oldPdfAssetId) {
          await silentDeleteAsset(userId, args.oldPdfAssetId);
        }
      }
    }

    if (archiveFullPage) {
      await storeFullPageArchive(
        ctx,
        page.htmlContent,
        page.url,
        args.oldFullPageArchiveAssetId,
      );
    }
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

async function fetchImage(ctx: CrawlContext, url: string) {
  const { contentType, body } = await crawler.fetchAsset(
    ctx,
    url,
    "banner image",
  );
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
    // The banner is optional, so a slow or hanging image host gets its own
    // budget instead of using up the whole crawl's (#1667).
    const bannerCtx: CrawlContext = {
      ...ctx,
      abortSignal: withDownloadTimeout(
        ctx.abortSignal,
        serverConfig.crawler.bannerDownloadTimeoutSec,
      ),
    };
    // Only a timeout during the download counts as one: the timer keeps
    // running afterwards, and a later storage error must keep its own message.
    let downloaded = false;
    try {
      const banner = url.startsWith("data:")
        ? decodeDataUriImage(ctx, url)
        : await fetchImage(bannerCtx, url);
      downloaded = true;
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
      if (
        !downloaded &&
        bannerCtx.abortSignal.aborted &&
        !ctx.abortSignal.aborted
      ) {
        ctx.log.warn(
          `Skipping the banner image: the download didn't finish within ${serverConfig.crawler.bannerDownloadTimeoutSec}s`,
        );
        return null;
      }
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
      const { contentType, body } = await crawler.fetchAsset(
        ctx,
        url,
        fileType,
      );

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
    const { userId, abortSignal, log } = ctx;
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

    const res = await crawler.archivePage(ctx, html, url, assetPath);

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
