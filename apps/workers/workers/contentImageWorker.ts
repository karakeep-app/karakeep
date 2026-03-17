import { createHash } from "crypto";

import { eq, and, inArray } from "drizzle-orm";
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
  readAsset,
  saveAsset,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

const MAX_RETRIES = 10;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
const IMAGE_ACCEPT =
  "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";

const CONTENT_IMAGE_ASSET_TYPES = new Set<string>([
  ...IMAGE_ASSET_TYPES,
  "image/svg+xml",
  "image/avif",
  "image/apng",
]);

// Magic byte signatures for common image formats.
// Used as a fallback when the server returns a wrong Content-Type header.
const MAGIC_SIGNATURES: [Buffer, string][] = [
  [Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg"],
  [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
  [Buffer.from("GIF87a"), "image/gif"],
  [Buffer.from("GIF89a"), "image/gif"],
  [Buffer.from("RIFF"), "image/webp"], // WebP starts with RIFF....WEBP
  [Buffer.from("<svg"), "image/svg+xml"],
];

export function detectImageType(buffer: Buffer): string | null {
  for (const [signature, mimeType] of MAGIC_SIGNATURES) {
    if (
      buffer.length >= signature.length &&
      buffer.subarray(0, signature.length).equals(signature)
    ) {
      // Extra check for WebP: bytes 8-11 must be "WEBP"
      if (mimeType === "image/webp") {
        if (
          buffer.length >= 12 &&
          buffer.subarray(8, 12).toString("ascii") === "WEBP"
        ) {
          return mimeType;
        }
        continue;
      }
      return mimeType;
    }
  }
  // AVIF: starts with a ftyp box containing "avif" or "avis" brand
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp"
  ) {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") {
      return "image/avif";
    }
  }
  return null;
}

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
          const bookmarkId = job.data.bookmarkId;
          await db
            .update(bookmarkLinks)
            .set({ contentImageStatus: "success" })
            .where(eq(bookmarkLinks.id, bookmarkId));
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
          const bookmarkId = job.data?.bookmarkId;
          if (bookmarkId && job.numRetriesLeft == 0) {
            await db
              .update(bookmarkLinks)
              .set({ contentImageStatus: "failure" })
              .where(eq(bookmarkLinks.id, bookmarkId));
          }
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
  url: string | null;
} | null> {
  const link = await db.query.bookmarkLinks.findFirst({
    where: eq(bookmarkLinks.id, bookmarkId),
    columns: {
      url: true,
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
        url: link.url,
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
      url: link.url,
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

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exported for testing. Produces a deterministic asset ID from bookmark + source URL
// so that retries reuse the same ID and can skip already-downloaded images.
export function contentImageAssetId(
  bookmarkId: string,
  sourceUrl: string,
): string {
  return createHash("sha256")
    .update(`${bookmarkId}:${sourceUrl}`)
    .digest("hex")
    .slice(0, 32);
}

// Exported for testing
export async function downloadImage(
  src: string,
  assetId: string,
  jobId: string,
  maxSizeBytes: number,
  referer?: string | null,
  abortSignal?: AbortSignal,
): Promise<DownloadedImage | null> {
  // Validate the URL first (no point retrying an invalid URL)
  const validation = await validateUrl(src, false);
  if (!validation.ok) {
    logger.debug(`[contentImage][${jobId}] Skipping invalid URL: ${src}`);
    return null;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1),
        MAX_BACKOFF_MS,
      );
      logger.debug(
        `[contentImage][${jobId}] Retry ${attempt}/${MAX_RETRIES} for ${src} after ${backoffMs}ms`,
      );
      await sleep(backoffMs);
    }

    try {
      const signals = [AbortSignal.timeout(30_000)];
      if (abortSignal) signals.push(abortSignal);

      const headers: Record<string, string> = {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: IMAGE_ACCEPT,
        "Accept-Language": "en-US,en;q=0.9",
      };
      if (referer) {
        headers["Referer"] = referer;
      }

      const response = await fetchWithProxy(src, {
        signal: AbortSignal.any(signals),
        headers,
      });

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          logger.debug(
            `[contentImage][${jobId}] Retryable status ${response.status} for: ${src}`,
          );
          continue;
        }
        logger.debug(
          `[contentImage][${jobId}] Failed to fetch image (status ${response.status}): ${src}`,
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

      const headerContentType = response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim();

      // Trust the Content-Type header if it's a known image type
      if (
        headerContentType &&
        CONTENT_IMAGE_ASSET_TYPES.has(headerContentType)
      ) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > maxSizeBytes) {
          logger.debug(
            `[contentImage][${jobId}] Image too large (${buffer.byteLength} bytes): ${src}`,
          );
          return null;
        }
        return { src, assetId, buffer, contentType: headerContentType };
      }

      // Fallback: read the buffer and detect image type from magic bytes
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > maxSizeBytes) {
        logger.debug(
          `[contentImage][${jobId}] Image too large (${buffer.byteLength} bytes): ${src}`,
        );
        return null;
      }

      const detectedType = detectImageType(buffer);
      if (detectedType && CONTENT_IMAGE_ASSET_TYPES.has(detectedType)) {
        logger.debug(
          `[contentImage][${jobId}] Detected ${detectedType} from magic bytes (server sent "${headerContentType}"): ${src}`,
        );
        return { src, assetId, buffer, contentType: detectedType };
      }

      logger.debug(
        `[contentImage][${jobId}] Unsupported content type "${headerContentType}" for: ${src}`,
      );
      return null;
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        logger.debug(
          `[contentImage][${jobId}] Error downloading image (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${src}: ${e}`,
        );
        continue;
      }
      logger.debug(
        `[contentImage][${jobId}] Error downloading image after ${MAX_RETRIES + 1} attempts: ${src}: ${e}`,
      );
      return null;
    }
  }

  return null;
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

  // Compute deterministic asset IDs and check which are already downloaded
  const urlAssetPairs = urlsToProcess.map((url) => ({
    url,
    assetId: contentImageAssetId(bookmarkId, url),
  }));

  const allAssetIds = urlAssetPairs.map((p) => p.assetId);
  const existingAssets = await db.query.assets.findMany({
    where: and(
      inArray(assets.id, allAssetIds),
      eq(assets.bookmarkId, bookmarkId),
      eq(assets.assetType, AssetTypes.CONTENT_IMAGE),
    ),
    columns: { id: true },
  });
  const existingAssetIds = new Set(existingAssets.map((a) => a.id));

  const urlsToDownload = urlAssetPairs.filter(
    (p) => !existingAssetIds.has(p.assetId),
  );

  logger.info(
    `[contentImage][${jobId}] Found ${imageUrls.length} external images, ${existingAssetIds.size} already cached, downloading ${urlsToDownload.length}`,
  );

  // Build the mapping for already-cached images
  const urlToAssetId = new Map<string, string>();
  for (const p of urlAssetPairs) {
    if (existingAssetIds.has(p.assetId)) {
      urlToAssetId.set(p.url, p.assetId);
    }
  }

  // Download and save new images sequentially to avoid rate limiting
  let quotaExceeded = false;

  for (const { url, assetId } of urlsToDownload) {
    if (quotaExceeded) break;

    const result = await downloadImage(
      url,
      assetId,
      jobId,
      maxSizeBytes,
      resolved.url,
      job.abortSignal,
    );
    if (!result) continue;

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

      // Upsert: the asset ID is deterministic, so on re-crawl with the same
      // image URL we overwrite the existing row rather than conflicting.
      await db
        .insert(assets)
        .values({
          id: result.assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.CONTENT_IMAGE,
          contentType: result.contentType,
          size: result.buffer.byteLength,
          fileName: null,
        })
        .onConflictDoUpdate({
          target: assets.id,
          set: {
            contentType: result.contentType,
            size: result.buffer.byteLength,
          },
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
