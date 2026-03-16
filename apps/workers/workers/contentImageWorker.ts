import { eq, and } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { workerStatsCounter } from "metrics";
import { fetchWithProxy, validateUrl } from "network";
import { withWorkerTracing } from "workerTracing";

import type { ZContentImageRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkLinks,
  bookmarks,
} from "@karakeep/db/schema";
import {
  ContentImageQueue,
  QuotaService,
  StorageQuotaError,
} from "@karakeep/shared-server";
import {
  IMAGE_ASSET_TYPES,
  newAssetId,
  readAsset,
  saveAsset,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import { limitConcurrency } from "@karakeep/shared/concurrency";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

const IMAGE_DOWNLOAD_CONCURRENCY = 5;

export class ContentImageWorker {
  static async build() {
    logger.info("Starting content image worker ...");
    const worker = (await getQueueClient())!.createRunner<ZContentImageRequest>(
      ContentImageQueue,
      {
        run: withWorkerTracing("contentImageWorker.run", run),
        onComplete: async (job) => {
          workerStatsCounter.labels("contentImage", "completed").inc();
          const jobId = job.id;
          logger.info(`[contentImage][${jobId}] Completed successfully`);
          return Promise.resolve();
        },
        onError: async (job) => {
          workerStatsCounter.labels("contentImage", "failed").inc();
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("contentImage", "failed_permanent").inc();
          }
          const jobId = job.id;
          logger.error(
            `[contentImage][${jobId}] Content image processing failed: ${job.error}\n${job.error.stack}`,
          );
          return Promise.resolve();
        },
      },
      {
        concurrency: serverConfig.contentImage.numWorkers,
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.contentImage.jobTimeoutSec,
      },
    );

    return worker;
  }
}

// Exported for testing
export async function resolveHtmlContent(
  bookmarkId: string,
  userId: string,
): Promise<{
  htmlContent: string;
  source: "inline" | "asset";
  contentAssetId: string | null;
} | null> {
  const link = await db.query.bookmarkLinks.findFirst({
    where: eq(bookmarkLinks.id, bookmarkId),
    columns: {
      htmlContent: true,
      contentAssetId: true,
    },
  });

  if (!link) {
    return null;
  }

  if (link.contentAssetId) {
    try {
      const { asset } = await readAsset({
        userId,
        assetId: link.contentAssetId,
      });
      return {
        htmlContent: asset.toString("utf8"),
        source: "asset",
        contentAssetId: link.contentAssetId,
      };
    } catch (e) {
      // Asset file missing on disk (orphaned reference) — fall through to
      // inline HTML if available, otherwise return null.
      logger.warn(
        `Failed to read content asset "${link.contentAssetId}" for bookmark "${bookmarkId}", falling back to inline HTML: ${e}`,
      );
    }
  }

  if (link.htmlContent) {
    return {
      htmlContent: link.htmlContent,
      source: "inline",
      contentAssetId: null,
    };
  }

  return null;
}

// Exported for testing. Accepts raw HTML or a pre-parsed JSDOM instance to
// avoid redundant parsing when the same DOM is reused by rewriteImageUrls.
export function extractExternalImageUrls(input: string | JSDOM): string[] {
  const dom = typeof input === "string" ? new JSDOM(input) : input;
  const images = dom.window.document.querySelectorAll("img[src]");
  const urls = new Set<string>();

  for (const img of images) {
    const src = img.getAttribute("src");
    if (!src) continue;
    // Skip data URIs
    if (src.startsWith("data:")) continue;
    // Skip already-rewritten asset URLs
    if (src.includes("/api/assets/")) continue;
    // Only process absolute HTTP(S) URLs
    if (src.startsWith("http://") || src.startsWith("https://")) {
      urls.add(src);
    }
  }

  return [...urls];
}

interface DownloadedImage {
  src: string;
  assetId: string;
  buffer: Buffer;
  contentType: string;
}

// Exported for testing
export async function downloadImage(
  src: string,
  jobId: string,
  maxSizeBytes: number,
  abortSignal?: AbortSignal,
): Promise<DownloadedImage | null> {
  try {
    // Validate the URL first
    const validation = await validateUrl(src, false);
    if (!validation.ok) {
      logger.debug(`[contentImage][${jobId}] Skipping invalid URL: ${src}`);
      return null;
    }

    const signals = [AbortSignal.timeout(30_000)];
    if (abortSignal) signals.push(abortSignal);

    const response = await fetchWithProxy(src, {
      signal: AbortSignal.any(signals),
    });

    if (!response.ok) {
      logger.debug(
        `[contentImage][${jobId}] Failed to fetch image (status ${response.status}): ${src}`,
      );
      return null;
    }

    const contentType = response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim();
    if (!contentType || !IMAGE_ASSET_TYPES.has(contentType)) {
      logger.debug(
        `[contentImage][${jobId}] Unsupported content type "${contentType}" for: ${src}`,
      );
      return null;
    }

    // Check content-length header if available
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
      logger.debug(
        `[contentImage][${jobId}] Image too large (${contentLength} bytes): ${src}`,
      );
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > maxSizeBytes) {
      logger.debug(
        `[contentImage][${jobId}] Image too large (${buffer.byteLength} bytes): ${src}`,
      );
      return null;
    }

    return {
      src,
      assetId: newAssetId(),
      buffer,
      contentType,
    };
  } catch (e) {
    logger.debug(
      `[contentImage][${jobId}] Error downloading image: ${src}: ${e}`,
    );
    return null;
  }
}

// Exported for testing. Accepts raw HTML or a pre-parsed JSDOM instance to
// avoid redundant parsing when the same DOM was already used by extractExternalImageUrls.
export function rewriteImageUrls(
  input: string | JSDOM,
  urlToAssetId: Map<string, string>,
): string {
  const dom = typeof input === "string" ? new JSDOM(input) : input;
  const images = dom.window.document.querySelectorAll("img[src]");

  for (const img of images) {
    const src = img.getAttribute("src");
    if (!src) continue;
    const assetId = urlToAssetId.get(src);
    if (assetId) {
      img.setAttribute("src", `/api/assets/${assetId}`);
    }
  }

  // JSDOM always creates a body, so this fallback is defensive.
  // When a raw string was passed we can preserve the original; for a shared
  // JSDOM instance the caller owns the input so empty string is acceptable.
  const fallback = typeof input === "string" ? input : "";
  return dom.window.document.body?.innerHTML ?? fallback;
}

// Exported for testing
export async function run(job: DequeuedJob<ZContentImageRequest>) {
  const jobId = job.id;
  const bookmarkId = job.data.bookmarkId;

  if (!serverConfig.crawler.storeContentImages) {
    logger.debug(
      `[contentImage][${jobId}] Content image caching is disabled, skipping`,
    );
    return;
  }

  logger.info(
    `[contentImage][${jobId}] Starting content image processing for bookmark "${bookmarkId}"`,
  );

  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: { id: true, userId: true },
  });

  if (!bookmark) {
    throw new Error(
      `[contentImage][${jobId}] Bookmark "${bookmarkId}" not found`,
    );
  }

  const userId = bookmark.userId;

  // Delete old content image assets for this bookmark (clean slate on re-crawl)
  // Physical files are orphaned and will be cleaned up by tidy_assets maintenance
  await db
    .delete(assets)
    .where(
      and(
        eq(assets.bookmarkId, bookmarkId),
        eq(assets.assetType, AssetTypes.CONTENT_IMAGE),
      ),
    );

  // Resolve HTML content
  const resolved = await resolveHtmlContent(bookmarkId, userId);
  if (!resolved) {
    logger.info(
      `[contentImage][${jobId}] No HTML content found for bookmark "${bookmarkId}", skipping`,
    );
    return;
  }

  // Parse HTML once and reuse the DOM for both extraction and rewriting
  const dom = new JSDOM(resolved.htmlContent);

  // Extract external image URLs
  const imageUrls = extractExternalImageUrls(dom);
  if (imageUrls.length === 0) {
    logger.info(`[contentImage][${jobId}] No external images found in content`);
    return;
  }

  const maxCount = serverConfig.crawler.contentImageMaxCount;
  const maxSizeBytes = serverConfig.crawler.contentImageMaxSizeMb * 1024 * 1024;
  const urlsToProcess = imageUrls.slice(0, maxCount);

  logger.info(
    `[contentImage][${jobId}] Found ${imageUrls.length} external images, processing up to ${urlsToProcess.length}`,
  );

  // Download images with bounded concurrency
  const downloadTasks = urlsToProcess.map(
    (url) => () => downloadImage(url, jobId, maxSizeBytes, job.abortSignal),
  );
  const downloadResults = await Promise.all(
    limitConcurrency(downloadTasks, IMAGE_DOWNLOAD_CONCURRENCY),
  );

  // Save successful downloads as assets
  const urlToAssetId = new Map<string, string>();
  let quotaExceeded = false;

  for (const result of downloadResults) {
    if (!result || quotaExceeded) continue;

    try {
      const quotaApproved = await QuotaService.checkStorageQuota(
        db,
        userId,
        result.buffer.byteLength,
      );

      await saveAsset({
        userId,
        assetId: result.assetId,
        asset: result.buffer,
        metadata: {
          contentType: result.contentType,
          fileName: null,
        },
        quotaApproved,
      });

      await db.insert(assets).values({
        id: result.assetId,
        bookmarkId,
        userId,
        assetType: AssetTypes.CONTENT_IMAGE,
        contentType: result.contentType,
        size: result.buffer.byteLength,
        fileName: null,
      });

      urlToAssetId.set(result.src, result.assetId);
    } catch (e) {
      if (e instanceof StorageQuotaError) {
        logger.warn(
          `[contentImage][${jobId}] Storage quota exceeded, stopping image processing`,
        );
        quotaExceeded = true;
      } else {
        logger.error(
          `[contentImage][${jobId}] Failed to save image asset for ${result.src}: ${e}`,
        );
      }
    }
  }

  if (urlToAssetId.size === 0) {
    logger.info(`[contentImage][${jobId}] No images were successfully saved`);
    return;
  }

  logger.info(
    `[contentImage][${jobId}] Successfully cached ${urlToAssetId.size} images, rewriting HTML`,
  );

  // Rewrite HTML with asset URLs (reuses the already-parsed DOM)
  const rewrittenHtml = rewriteImageUrls(dom, urlToAssetId);

  // Store updated HTML — wrap in try/catch so a quota error at this stage
  // doesn't fail the entire job (the images are already saved).
  try {
    if (resolved.source === "asset" && resolved.contentAssetId) {
      // Overwrite the existing content asset
      const quotaApproved = await QuotaService.checkStorageQuota(
        db,
        userId,
        Buffer.byteLength(rewrittenHtml, "utf8"),
      );
      await saveAsset({
        userId,
        assetId: resolved.contentAssetId,
        asset: Buffer.from(rewrittenHtml, "utf8"),
        metadata: {
          contentType: "text/html",
          fileName: null,
        },
        quotaApproved,
      });
      // Update the size in the assets table
      await db
        .update(assets)
        .set({ size: Buffer.byteLength(rewrittenHtml, "utf8") })
        .where(eq(assets.id, resolved.contentAssetId));
    } else {
      // Update inline HTML content
      await db
        .update(bookmarkLinks)
        .set({ htmlContent: rewrittenHtml })
        .where(eq(bookmarkLinks.id, bookmarkId));
    }
  } catch (e) {
    if (e instanceof StorageQuotaError) {
      logger.warn(
        `[contentImage][${jobId}] Storage quota exceeded while saving rewritten HTML, images were cached but HTML not updated`,
      );
    } else {
      throw e;
    }
  }

  logger.info(
    `[contentImage][${jobId}] Content image processing complete for bookmark "${bookmarkId}"`,
  );
}
