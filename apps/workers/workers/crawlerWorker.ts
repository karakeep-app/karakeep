import * as fsSync from "fs";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { eq } from "drizzle-orm";
import { execa } from "execa";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { JSDOM, VirtualConsole } from "jsdom";
import metascraper from "metascraper";
import metascraperAmazon from "metascraper-amazon";
import metascraperAuthor from "metascraper-author";
import metascraperDate from "metascraper-date";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperLogo from "metascraper-logo-favicon";
import metascraperPublisher from "metascraper-publisher";
import metascraperTitle from "metascraper-title";
import metascraperTwitter from "metascraper-twitter";
import metascraperUrl from "metascraper-url";
import { workerStatsCounter } from "metrics";
import { fetchWithProxy, getRandomProxy } from "@karakeep/shared-server";
import { getBookmarkDetails, updateAsset } from "workerUtils";

import type { ZCrawlLinkRequest } from "@karakeep/shared-server";
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
  AssetPreprocessingQueue,
  LinkCrawlerQueue,
  OpenAIQueue,
  QuotaService,
  triggerSearchReindex,
  triggerWebhook,
  VideoWorkerQueue,
  zCrawlLinkRequestSchema,
} from "@karakeep/shared-server";
import {
  ASSET_TYPES,
  getAssetSize,
  IMAGE_ASSET_TYPES,
  newAssetId,
  readAsset,
  saveAsset,
  saveAssetFromFile,
  silentDeleteAsset,
  SUPPORTED_UPLOAD_ASSET_TYPES,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import { getCrawlerClient } from "@karakeep/shared/crawler";
import logger from "@karakeep/shared/logger";
import {
  DequeuedJob,
  EnqueueOptions,
  getQueueClient,
} from "@karakeep/shared/queueing";
import { tryCatch } from "@karakeep/shared/tryCatch";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import metascraperReddit from "../metascraper-plugins/metascraper-reddit";

function abortPromise(signal: AbortSignal): Promise<never> {
  if (signal.aborted) {
    const p = Promise.reject(signal.reason ?? new Error("AbortError"));
    p.catch(() => {
      /* empty */
    }); // suppress unhandledRejection if not awaited
    return p;
  }

  const p = new Promise<never>((_, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(signal.reason ?? new Error("AbortError"));
      },
      { once: true },
    );
  });

  p.catch(() => {
    /* empty */
  });
  return p;
}

/**
 * Normalize a Content-Type header by stripping parameters (e.g., charset)
 * and lowercasing the media type, so comparisons against supported types work.
 */
function normalizeContentType(header: string | null): string | null {
  if (!header) {
    return null;
  }
  return header.split(";", 1)[0]!.trim().toLowerCase();
}

const metascraperParser = metascraper([
  metascraperDate({
    dateModified: true,
    datePublished: true,
  }),
  metascraperAmazon(),
  metascraperReddit(),
  metascraperAuthor(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperDescription(),
  metascraperTwitter(),
  metascraperImage(),
  metascraperLogo({
    gotOpts: {
      agent: {
        http: serverConfig.proxy.httpProxy
          ? new HttpProxyAgent(getRandomProxy(serverConfig.proxy.httpProxy))
          : undefined,
        https: serverConfig.proxy.httpsProxy
          ? new HttpsProxyAgent(getRandomProxy(serverConfig.proxy.httpsProxy))
          : undefined,
      },
    },
  }),
  metascraperUrl(),
]);


export class CrawlerWorker {
  static async build() {
    logger.info("Starting crawler worker ...");
    const worker = (await getQueueClient())!.createRunner<ZCrawlLinkRequest>(
      LinkCrawlerQueue,
      {
        run: runCrawler,
        onComplete: async (job) => {
          workerStatsCounter.labels("crawler", "completed").inc();
          const jobId = job.id;
          logger.info(`[Crawler][${jobId}] Completed successfully`);
          const bookmarkId = job.data.bookmarkId;
          if (bookmarkId) {
            await changeBookmarkStatus(bookmarkId, "success");
          }
        },
        onError: async (job) => {
          workerStatsCounter.labels("crawler", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[Crawler][${jobId}] Crawling job failed: ${job.error}\n${job.error.stack}`,
          );
          const bookmarkId = job.data?.bookmarkId;
          if (bookmarkId && job.numRetriesLeft == 0) {
            await changeBookmarkStatus(bookmarkId, "failure");
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


type DBAssetType = typeof assets.$inferInsert;

async function changeBookmarkStatus(
  bookmarkId: string,
  crawlStatus: "success" | "failure",
) {
  await db
    .update(bookmarkLinks)
    .set({
      crawlStatus,
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
}


async function extractMetadata(
  htmlContent: string,
  url: string,
  jobId: string,
) {
  logger.info(
    `[Crawler][${jobId}] Will attempt to extract metadata from page ...`,
  );
  const meta = await metascraperParser({
    url,
    html: htmlContent,
    // We don't want to validate the URL again as we've already done it by visiting the page.
    // This was added because URL validation fails if the URL ends with a question mark (e.g. empty query params).
    validateUrl: false,
  });
  logger.info(`[Crawler][${jobId}] Done extracting metadata from the page.`);
  return meta;
}

function extractReadableContent(
  htmlContent: string,
  url: string,
  jobId: string,
) {
  logger.info(
    `[Crawler][${jobId}] Will attempt to extract readable content ...`,
  );
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(htmlContent, { url, virtualConsole });
  let result: { content: string } | null = null;
  try {
    const readableContent = new Readability(dom.window.document).parse();
    if (!readableContent || typeof readableContent.content !== "string") {
      return null;
    }

    const purifyWindow = new JSDOM("").window;
    try {
      const purify = DOMPurify(purifyWindow);
      const purifiedHTML = purify.sanitize(readableContent.content);

      logger.info(`[Crawler][${jobId}] Done extracting readable content.`);
      result = {
        content: purifiedHTML,
      };
    } finally {
      purifyWindow.close();
    }
  } finally {
    dom.window.close();
  }

  return result;
}

async function storeScreenshot(
  screenshot: Buffer | undefined,
  userId: string,
  jobId: string,
) {
  if (!serverConfig.crawler.storeScreenshot) {
    logger.info(
      `[Crawler][${jobId}] Skipping storing the screenshot as per the config.`,
    );
    return null;
  }
  if (!screenshot) {
    logger.info(
      `[Crawler][${jobId}] Skipping storing the screenshot as it's empty.`,
    );
    return null;
  }
  const assetId = newAssetId();
  const contentType = "image/jpeg";
  const fileName = "screenshot.jpeg";

  // Check storage quota before saving the screenshot
  const { data: quotaApproved, error: quotaError } = await tryCatch(
    QuotaService.checkStorageQuota(db, userId, screenshot.byteLength),
  );

  if (quotaError) {
    logger.warn(
      `[Crawler][${jobId}] Skipping screenshot storage due to quota exceeded: ${quotaError.message}`,
    );
    return null;
  }

  await saveAsset({
    userId,
    assetId,
    metadata: { contentType, fileName },
    asset: screenshot,
    quotaApproved,
  });
  logger.info(
    `[Crawler][${jobId}] Stored the screenshot as assetId: ${assetId} (${screenshot.byteLength} bytes)`,
  );
  return { assetId, contentType, fileName, size: screenshot.byteLength };
}

async function downloadAndStoreFile(
  url: string,
  userId: string,
  jobId: string,
  fileType: string,
  abortSignal: AbortSignal,
) {
  let assetPath: string | undefined;
  try {
    logger.info(
      `[Crawler][${jobId}] Downloading ${fileType} from "${url.length > 100 ? url.slice(0, 100) + "..." : url}"`,
    );
    const response = await fetchWithProxy(url, {
      signal: abortSignal,
    });
    if (!response.ok || response.body == null) {
      throw new Error(`Failed to download ${fileType}: ${response.status}`);
    }

    const contentType = normalizeContentType(
      response.headers.get("content-type"),
    );
    if (!contentType) {
      throw new Error("No content type in the response");
    }

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
      response.body,
      contentLengthEnforcer,
      fsSync.createWriteStream(assetPath),
    );

    // Check storage quota before saving the asset
    const { data: quotaApproved, error: quotaError } = await tryCatch(
      QuotaService.checkStorageQuota(db, userId, bytesRead),
    );

    if (quotaError) {
      logger.warn(
        `[Crawler][${jobId}] Skipping ${fileType} storage due to quota exceeded: ${quotaError.message}`,
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

    logger.info(
      `[Crawler][${jobId}] Downloaded ${fileType} as assetId: ${assetId} (${bytesRead} bytes)`,
    );

    return { assetId, userId, contentType, size: bytesRead };
  } catch (e) {
    logger.error(
      `[Crawler][${jobId}] Failed to download and store ${fileType}: ${e}`,
    );
    return null;
  } finally {
    if (assetPath) {
      await tryCatch(fs.unlink(assetPath));
    }
  }
}

async function downloadAndStoreImage(
  url: string,
  userId: string,
  jobId: string,
  abortSignal: AbortSignal,
) {
  if (!serverConfig.crawler.downloadBannerImage) {
    logger.info(
      `[Crawler][${jobId}] Skipping downloading the image as per the config.`,
    );
    return null;
  }
  return downloadAndStoreFile(url, userId, jobId, "image", abortSignal);
}

async function archiveWebpage(
  html: string,
  url: string,
  userId: string,
  jobId: string,
  abortSignal: AbortSignal,
) {
  logger.info(`[Crawler][${jobId}] Will attempt to archive page ...`);
  const assetId = newAssetId();
  const assetPath = path.join(os.tmpdir(), assetId);

  let res = await execa({
    input: html,
    cancelSignal: abortSignal,
    env: {
      https_proxy: serverConfig.proxy.httpsProxy
        ? getRandomProxy(serverConfig.proxy.httpsProxy)
        : undefined,
      http_proxy: serverConfig.proxy.httpProxy
        ? getRandomProxy(serverConfig.proxy.httpProxy)
        : undefined,
      no_proxy: serverConfig.proxy.noProxy?.join(","),
    },
  })("monolith", ["-", "-Ije", "-t", "5", "-b", url, "-o", assetPath]);

  if (res.isCanceled) {
    logger.error(
      `[Crawler][${jobId}] Canceled archiving the page as we hit global timeout.`,
    );
    await tryCatch(fs.unlink(assetPath));
    return null;
  }

  if (res.exitCode !== 0) {
    logger.error(
      `[Crawler][${jobId}] Failed to archive the page as the command exited with code ${res.exitCode}`,
    );
    await tryCatch(fs.unlink(assetPath));
    return null;
  }

  const contentType = "text/html";

  // Get file size and check quota before saving
  const stats = await fs.stat(assetPath);
  const fileSize = stats.size;

  const { data: quotaApproved, error: quotaError } = await tryCatch(
    QuotaService.checkStorageQuota(db, userId, fileSize),
  );

  if (quotaError) {
    logger.warn(
      `[Crawler][${jobId}] Skipping page archive storage due to quota exceeded: ${quotaError.message}`,
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

  logger.info(
    `[Crawler][${jobId}] Done archiving the page as assetId: ${assetId}`,
  );

  return {
    assetId,
    contentType,
    size: await getAssetSize({ userId, assetId }),
  };
}

async function getContentType(
  url: string,
  jobId: string,
  abortSignal: AbortSignal,
): Promise<string | null> {
  try {
    logger.info(
      `[Crawler][${jobId}] Attempting to determine the content-type for the url ${url}`,
    );
    const response = await fetchWithProxy(url, {
      method: "HEAD",
      signal: AbortSignal.any([AbortSignal.timeout(5000), abortSignal]),
    });
    const rawContentType = response.headers.get("content-type");
    const contentType = normalizeContentType(rawContentType);
    logger.info(
      `[Crawler][${jobId}] Content-type for the url ${url} is "${contentType}"`,
    );
    return contentType;
  } catch (e) {
    logger.error(
      `[Crawler][${jobId}] Failed to determine the content-type for the url ${url}: ${e}`,
    );
    return null;
  }
}

/**
 * Downloads the asset from the URL and transforms the linkBookmark to an assetBookmark
 * @param url the url the user provided
 * @param assetType the type of the asset we're downloading
 * @param userId the id of the user
 * @param jobId the id of the job for logging
 * @param bookmarkId the id of the bookmark
 */
async function handleAsAssetBookmark(
  url: string,
  assetType: "image" | "pdf",
  userId: string,
  jobId: string,
  bookmarkId: string,
  abortSignal: AbortSignal,
) {
  const downloaded = await downloadAndStoreFile(
    url,
    userId,
    jobId,
    assetType,
    abortSignal,
  );
  if (!downloaded) {
    return;
  }
  const fileName = path.basename(new URL(url).pathname);
  await db.transaction(async (trx) => {
    await updateAsset(
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
    await trx.insert(bookmarkAssets).values({
      id: bookmarkId,
      assetType,
      assetId: downloaded.assetId,
      content: null,
      fileName,
      sourceUrl: url,
    });
    // Switch the type of the bookmark from LINK to ASSET
    await trx
      .update(bookmarks)
      .set({ type: BookmarkTypes.ASSET })
      .where(eq(bookmarks.id, bookmarkId));
    await trx.delete(bookmarkLinks).where(eq(bookmarkLinks.id, bookmarkId));
  });
  await AssetPreprocessingQueue.enqueue({
    bookmarkId,
    fixMode: false,
  });
}

type StoreHtmlResult =
  | { result: "stored"; assetId: string; size: number }
  | { result: "store_inline" }
  | { result: "not_stored" };

async function storeHtmlContent(
  htmlContent: string | undefined,
  userId: string,
  jobId: string,
): Promise<StoreHtmlResult> {
  if (!htmlContent) {
    return { result: "not_stored" };
  }

  const contentSize = Buffer.byteLength(htmlContent, "utf8");

  // Only store in assets if content is >= 50KB
  if (contentSize < serverConfig.crawler.htmlContentSizeThreshold) {
    logger.info(
      `[Crawler][${jobId}] HTML content size (${contentSize} bytes) is below threshold, storing inline`,
    );
    return { result: "store_inline" };
  }

  const { data: quotaApproved, error: quotaError } = await tryCatch(
    QuotaService.checkStorageQuota(db, userId, contentSize),
  );
  if (quotaError) {
    logger.warn(
      `[Crawler][${jobId}] Skipping HTML content storage due to quota exceeded: ${quotaError.message}`,
    );
    return { result: "not_stored" };
  }

  const assetId = newAssetId();

  const { error: saveError } = await tryCatch(
    saveAsset({
      userId,
      assetId,
      asset: Buffer.from(htmlContent, "utf8"),
      metadata: {
        contentType: ASSET_TYPES.TEXT_HTML,
        fileName: null,
      },
      quotaApproved,
    }),
  );
  if (saveError) {
    logger.error(
      `[Crawler][${jobId}] Failed to store HTML content as asset: ${saveError}`,
    );
    throw saveError;
  }

  logger.info(
    `[Crawler][${jobId}] Stored large HTML content (${contentSize} bytes) as asset: ${assetId}`,
  );

  return {
    result: "stored",
    assetId,
    size: contentSize,
  };
}

async function crawlAndParseUrl(
  url: string,
  userId: string,
  jobId: string,
  bookmarkId: string,
  oldScreenshotAssetId: string | undefined,
  oldImageAssetId: string | undefined,
  oldFullPageArchiveAssetId: string | undefined,
  oldContentAssetId: string | undefined,
  precrawledArchiveAssetId: string | undefined,
  archiveFullPage: boolean,
  abortSignal: AbortSignal,
) {
  let result: {
    htmlContent: string;
    screenshot: Buffer | undefined;
    statusCode: number | null;
    url: string;
  };

  if (precrawledArchiveAssetId) {
    logger.info(
      `[Crawler][${jobId}] The page has been precrawled. Will use the precrawled archive instead.`,
    );
    const asset = await readAsset({
      userId,
      assetId: precrawledArchiveAssetId,
    });
    result = {
      htmlContent: asset.asset.toString(),
      screenshot: undefined,
      statusCode: 200,
      url,
    };
  } else {
    // Use the crawler plugin
    const crawler = await getCrawlerClient();
    result = await crawler.crawl(url, {
      userId,
      jobId,
      abortSignal,
    });
  }
  abortSignal.throwIfAborted();

  const { htmlContent, screenshot, statusCode, url: browserUrl } = result;

  const meta = await Promise.race([
    extractMetadata(htmlContent, browserUrl, jobId),
    abortPromise(abortSignal),
  ]);
  abortSignal.throwIfAborted();

  let readableContent = await Promise.race([
    extractReadableContent(htmlContent, browserUrl, jobId),
    abortPromise(abortSignal),
  ]);
  abortSignal.throwIfAborted();

  const screenshotAssetInfo = await Promise.race([
    storeScreenshot(screenshot, userId, jobId),
    abortPromise(abortSignal),
  ]);
  abortSignal.throwIfAborted();

  const htmlContentAssetInfo = await storeHtmlContent(
    readableContent?.content,
    userId,
    jobId,
  );
  abortSignal.throwIfAborted();
  let imageAssetInfo: DBAssetType | null = null;
  if (meta.image) {
    const downloaded = await downloadAndStoreImage(
      meta.image,
      userId,
      jobId,
      abortSignal,
    );
    if (downloaded) {
      imageAssetInfo = {
        id: downloaded.assetId,
        bookmarkId,
        userId,
        assetType: AssetTypes.LINK_BANNER_IMAGE,
        contentType: downloaded.contentType,
        size: downloaded.size,
      };
    }
  }
  abortSignal.throwIfAborted();

  const parseDate = (date: string | undefined) => {
    if (!date) {
      return null;
    }
    try {
      return new Date(date);
    } catch {
      return null;
    }
  };

  // TODO(important): Restrict the size of content to store
  const assetDeletionTasks: Promise<void>[] = [];
  const inlineHtmlContent =
    htmlContentAssetInfo.result === "store_inline"
      ? (readableContent?.content ?? null)
      : null;
  readableContent = null;
  await db.transaction(async (txn) => {
    await txn
      .update(bookmarkLinks)
      .set({
        title: meta.title,
        description: meta.description,
        // Don't store data URIs as they're not valid URLs and are usually quite large
        imageUrl: meta.image?.startsWith("data:") ? null : meta.image,
        favicon: meta.logo,
        htmlContent: inlineHtmlContent,
        contentAssetId:
          htmlContentAssetInfo.result === "stored"
            ? htmlContentAssetInfo.assetId
            : null,
        crawledAt: new Date(),
        crawlStatusCode: statusCode,
        author: meta.author,
        publisher: meta.publisher,
        datePublished: parseDate(meta.datePublished),
        dateModified: parseDate(meta.dateModified),
      })
      .where(eq(bookmarkLinks.id, bookmarkId));

    if (screenshotAssetInfo) {
      await updateAsset(
        oldScreenshotAssetId,
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
      assetDeletionTasks.push(silentDeleteAsset(userId, oldScreenshotAssetId));
    }
    if (imageAssetInfo) {
      await updateAsset(oldImageAssetId, imageAssetInfo, txn);
      assetDeletionTasks.push(silentDeleteAsset(userId, oldImageAssetId));
    }
    if (htmlContentAssetInfo.result === "stored") {
      await updateAsset(
        oldContentAssetId,
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
      assetDeletionTasks.push(silentDeleteAsset(userId, oldContentAssetId));
    } else if (oldContentAssetId) {
      // Unlink the old content asset
      await txn.delete(assets).where(eq(assets.id, oldContentAssetId));
      assetDeletionTasks.push(silentDeleteAsset(userId, oldContentAssetId));
    }
  });

  // Delete the old assets if any
  await Promise.all(assetDeletionTasks);

  return async () => {
    if (
      !precrawledArchiveAssetId &&
      (serverConfig.crawler.fullPageArchive || archiveFullPage)
    ) {
      const archiveResult = await archiveWebpage(
        htmlContent,
        browserUrl,
        userId,
        jobId,
        abortSignal,
      );

      if (archiveResult) {
        const {
          assetId: fullPageArchiveAssetId,
          size,
          contentType,
        } = archiveResult;

        await db.transaction(async (txn) => {
          await updateAsset(
            oldFullPageArchiveAssetId,
            {
              id: fullPageArchiveAssetId,
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
        if (oldFullPageArchiveAssetId) {
          await silentDeleteAsset(userId, oldFullPageArchiveAssetId);
        }
      }
    }
  };
}

async function runCrawler(job: DequeuedJob<ZCrawlLinkRequest>) {
  const jobId = `${job.id}:${job.runNumber}`;

  const request = zCrawlLinkRequestSchema.safeParse(job.data);
  if (!request.success) {
    logger.error(
      `[Crawler][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
    return;
  }

  const { bookmarkId, archiveFullPage } = request.data;
  const {
    url,
    userId,
    screenshotAssetId: oldScreenshotAssetId,
    imageAssetId: oldImageAssetId,
    fullPageArchiveAssetId: oldFullPageArchiveAssetId,
    contentAssetId: oldContentAssetId,
    precrawledArchiveAssetId,
  } = await getBookmarkDetails(bookmarkId);

  logger.info(
    `[Crawler][${jobId}] Will crawl "${url}" for link with id "${bookmarkId}"`,
  );

  const contentType = await getContentType(url, jobId, job.abortSignal);
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
    );
  } else {
    const archivalLogic = await crawlAndParseUrl(
      url,
      userId,
      jobId,
      bookmarkId,
      oldScreenshotAssetId,
      oldImageAssetId,
      oldFullPageArchiveAssetId,
      oldContentAssetId,
      precrawledArchiveAssetId,
      archiveFullPage,
      job.abortSignal,
    );

    // Propagate priority to child jobs
    const enqueueOpts: EnqueueOptions = {
      priority: job.priority,
    };

    // Enqueue openai job (if not set, assume it's true for backward compatibility)
    if (job.data.runInference !== false) {
      await OpenAIQueue.enqueue(
        {
          bookmarkId,
          type: "tag",
        },
        enqueueOpts,
      );
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
    await triggerWebhook(bookmarkId, "crawled", undefined, enqueueOpts);

    // Do the archival as a separate last step as it has the potential for failure
    await archivalLogic();
  }
}
