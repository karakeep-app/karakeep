// The crawler worker's queue wiring and per-job orchestration. The heavy
// lifting lives in ./crawler/: browser lifecycle (browser.ts), the browser
// fetch itself (crawlPage.ts), the pre-crawl probe (probe.ts), HTML parsing
// (parseSubprocess.ts), asset persistence (assetStorage.ts), and the
// per-bookmark crawl flow (crawlAndParse.ts).
import { and, eq } from "drizzle-orm";
import { bookmarkCrawlLatencyHistogram, workerStatsCounter } from "metrics";
import { getBookmarkDomain, selectRunProxies } from "network";
import { withWorkerTracing, withWorkerEventLog } from "workerTracing";
import { getBookmarkDetails } from "workerUtils";

import type { ZCrawlLinkRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { bookmarkLinks, bookmarks } from "@karakeep/db/schema";
import {
  addLogFields,
  EmbeddingsQueue,
  getTracer,
  OpenAIQueue,
  triggerSearchReindex,
  VideoWorkerQueue,
  withSpan,
  zCrawlLinkRequestSchema,
} from "@karakeep/shared-server";
import {
  ASSET_TYPES,
  IMAGE_ASSET_TYPES,
  SUPPORTED_UPLOAD_ASSET_TYPES,
} from "@karakeep/shared/assetdb";
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
import { WebhooksService } from "@karakeep/trpc/models/webhooks.service";

import {
  getGlobalBrowser,
  initializeBrowserEnvironment,
} from "./crawler/browser";
import {
  crawlAndParseUrl,
  handleAsAssetBookmark,
} from "./crawler/crawlAndParse";
import {
  getContentTypeAndMetadata,
  loadStoredProbeMetadata,
  writeProbeMetadata,
} from "./crawler/probe";
import type { UrlProbeResult } from "./crawler/probe";
import { redactUrlCredentials, truncateUrl } from "./crawler/utils";

// Re-exported for the adhoc crawl CLI (scripts/crawlAdhoc.ts).
export { crawlPage } from "./crawler/crawlPage";

const tracer = getTracer("@karakeep/workers");

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
            await db.transaction(async (tx) => {
              await tx
                .update(bookmarkLinks)
                .set({
                  crawlStatus: "failure",
                })
                .where(eq(bookmarkLinks.id, bookmarkId));
              await tx
                .update(bookmarks)
                .set({
                  taggingStatus: null,
                })
                .where(
                  and(
                    eq(bookmarks.id, bookmarkId),
                    eq(bookmarks.taggingStatus, "pending"),
                  ),
                );
              await tx
                .update(bookmarks)
                .set({
                  summarizationStatus: null,
                })
                .where(
                  and(
                    eq(bookmarks.id, bookmarkId),
                    eq(bookmarks.summarizationStatus, "pending"),
                  ),
                );
              await tx
                .update(bookmarks)
                .set({
                  embeddingStatus: null,
                })
                .where(
                  and(
                    eq(bookmarks.id, bookmarkId),
                    eq(bookmarks.embeddingStatus, "pending"),
                  ),
                );
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

/**
 * Checks if the domain should be rate limited and throws QueueRetryAfterError if needed.
 * @throws {QueueRetryAfterError} if the domain is rate limited
 */
async function checkDomainRateLimit(url: string, jobId: string): Promise<void> {
  return await withSpan(
    tracer,
    "crawlerWorker.checkDomainRateLimit",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
      },
    },
    async () => {
      const crawlerDomainRateLimitConfig =
        serverConfig.crawler.domainRatelimiting;
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
        logger.info(
          `[Crawler][${jobId}] Domain "${hostname}" is rate limited. Will retry in ${(delayMs / 1000).toFixed(2)} seconds (with jitter).`,
        );
        throw new QueueRetryAfterError(
          `Domain "${hostname}" is rate limited`,
          delayMs,
        );
      }
    },
  );
}

/**
 * Enqueues the follow-up work after a successful webpage crawl: inference
 * (tagging/summarization/embeddings), search reindexing, video download, and
 * the "crawled" webhook.
 */
async function enqueuePostCrawlJobs(
  job: DequeuedJob<ZCrawlLinkRequest>,
  bookmarkId: string,
  userId: string,
  url: string,
): Promise<void> {
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

async function runCrawler(
  job: DequeuedJob<ZCrawlLinkRequest>,
  maxRetries: number,
): Promise<CrawlerRunResult> {
  const jobId = `${job.id}:${job.runNumber}`;
  const numRetriesLeft = Math.max(maxRetries - job.runNumber, 0);

  const request = zCrawlLinkRequestSchema.safeParse(job.data);
  if (!request.success) {
    logger.error(
      `[Crawler][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
    return { status: "completed" };
  }

  const { bookmarkId, archiveFullPage, storePdf } = request.data;
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

  await checkDomainRateLimit(url, jobId);

  // Select proxy URLs once for the entire run so all requests use the same proxy.
  const runProxy = selectRunProxies();

  addLogFields<"crawlerWorker.run">({
    "crawler.url": url,
    "crawler.domain": getBookmarkDomain(url),
    "crawler.proxy": redactUrlCredentials(
      runProxy.httpsProxy ?? runProxy.httpProxy ?? "",
    ),
  });

  logger.info(
    `[Crawler][${jobId}] Will crawl "${truncateUrl(url)}" for link with id "${bookmarkId}"`,
  );

  if (precrawledArchiveAssetId) {
    logger.info(
      `[Crawler][${jobId}] Skipped fetching content-type for the url ${url} as precrawledArchiveAssetId exists`,
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
      : await getContentTypeAndMetadata(url, jobId, job.abortSignal, runProxy, {
          skipMetadataExtraction: reuseStoredProbeMetadata,
        });
  job.abortSignal.throwIfAborted();

  // Link bookmarks get transformed into asset bookmarks if they point to a supported asset instead of a webpage
  const isPdf = contentType === ASSET_TYPES.APPLICATION_PDF;

  if (isPdf) {
    await handleAsAssetBookmark(
      url,
      "pdf",
      userId,
      jobId,
      bookmarkId,
      job.abortSignal,
      runProxy,
    );
  } else if (
    contentType &&
    IMAGE_ASSET_TYPES.has(contentType) &&
    SUPPORTED_UPLOAD_ASSET_TYPES.has(contentType)
  ) {
    await handleAsAssetBookmark(
      url,
      "image",
      userId,
      jobId,
      bookmarkId,
      job.abortSignal,
      runProxy,
    );
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
      ? loadStoredProbeMetadata(bookmarkId, jobId)
      : probeMetadata.then(async (metadata) => {
          if (metadata) {
            const { error } = await tryCatch(
              writeProbeMetadata(bookmarkId, metadata, jobId),
            );
            if (error) {
              logger.warn(
                `[Crawler][${jobId}] Failed to write early probe metadata: ${error}`,
              );
            }
          }
          return metadata;
        });
    const archivalLogic = await crawlAndParseUrl({
      url,
      userId,
      jobId,
      bookmarkId,
      oldAssets: {
        screenshotAssetId: oldScreenshotAssetId,
        pdfAssetId: oldPdfAssetId,
        imageAssetId: oldImageAssetId,
        fullPageArchiveAssetId: oldFullPageArchiveAssetId,
        contentAssetId: oldContentAssetId,
      },
      precrawledArchiveAssetId,
      archiveFullPage,
      forceStorePdf: storePdf ?? false,
      numRetriesLeft,
      abortSignal: job.abortSignal,
      runProxy,
      probeMetadataPromise,
    });

    await enqueuePostCrawlJobs(job, bookmarkId, userId, url);

    // Do the archival as a separate last step as it has the potential for failure
    await archivalLogic();
  }

  // Record the latency from bookmark creation to crawl completion.
  // Only for first-time, high-priority crawls (excludes recrawls and imports).
  if (crawledAt === null && job.priority === 0) {
    const latencySeconds = (Date.now() - createdAt.getTime()) / 1000;
    bookmarkCrawlLatencyHistogram.observe(latencySeconds);
  }

  return { status: "completed" };
}
