// Everything that persists crawl outputs as assets: screenshots, PDFs,
// banner images (including data: URIs from precrawled archives), large HTML
// content, downloaded files, and monolith full-page archives. All of these
// are quota-checked before writing.
import { promises as fs } from "fs";
import * as fsSync from "fs";
import * as path from "node:path";
import * as os from "os";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { dataUriToBuffer } from "data-uri-to-buffer";
import type { MimeBuffer } from "data-uri-to-buffer";
import { execa } from "execa";
import { fetchWithProxy, getBookmarkDomain } from "network";
import type { RunProxyConfig } from "network";

import { db } from "@karakeep/db";
import { getTracer, QuotaService, withSpan } from "@karakeep/shared-server";
import {
  ASSET_TYPES,
  getAssetSize,
  IMAGE_ASSET_TYPES,
  newAssetId,
  saveAsset,
  saveAssetFromFile,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { tryCatch } from "@karakeep/shared/tryCatch";

import { normalizeContentType, truncateUrl } from "./utils";

const tracer = getTracer("@karakeep/workers");

export async function storeScreenshot(
  screenshot: Buffer | undefined,
  userId: string,
  jobId: string,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.storeScreenshot",
    {
      attributes: {
        "job.id": jobId,
        "user.id": userId,
        "asset.size": screenshot?.byteLength ?? 0,
      },
    },
    async () => {
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
    },
  );
}

export async function storePdf(
  pdf: Buffer | undefined,
  userId: string,
  jobId: string,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.storePdf",
    {
      attributes: {
        "job.id": jobId,
        "user.id": userId,
        "asset.size": pdf?.byteLength ?? 0,
      },
    },
    async () => {
      if (!pdf) {
        logger.info(
          `[Crawler][${jobId}] Skipping storing the PDF as it's empty.`,
        );
        return null;
      }
      const assetId = newAssetId();
      const contentType = "application/pdf";
      const fileName = "page.pdf";

      // Check storage quota before saving the PDF
      const { data: quotaApproved, error: quotaError } = await tryCatch(
        QuotaService.checkStorageQuota(db, userId, pdf.byteLength),
      );

      if (quotaError) {
        logger.warn(
          `[Crawler][${jobId}] Skipping PDF storage due to quota exceeded: ${quotaError.message}`,
        );
        return null;
      }

      await saveAsset({
        userId,
        assetId,
        metadata: { contentType, fileName },
        asset: pdf,
        quotaApproved,
      });
      logger.info(
        `[Crawler][${jobId}] Stored the PDF as assetId: ${assetId} (${pdf.byteLength} bytes)`,
      );
      return { assetId, contentType, fileName, size: pdf.byteLength };
    },
  );
}

/**
 * SingleFile / precrawled archives inline images as `data:` URIs, so the image
 * URL metascraper extracts can be a base64 blob rather than something fetchable
 * over the network. Decode it locally and store it as an asset instead of
 * failing on the unsupported protocol.
 */
async function storeDataUriAsset(
  url: string,
  userId: string,
  jobId: string,
  fileType: string,
) {
  const maxBytes = serverConfig.maxAssetSizeMb * 1024 * 1024;

  // Guardrail 1: cap the size *before* decoding into memory. base64 encodes 3
  // bytes per 4 chars, so a URI longer than 4/3 the limit (plus header slack)
  // must decode past it; the exact check below handles the rest.
  if (url.length > Math.ceil((maxBytes * 4) / 3) + 1024) {
    logger.warn(
      `[Crawler][${jobId}] Skipping data URI ${fileType}: encoded size (${url.length} chars) exceeds maximum allowed size of ${serverConfig.maxAssetSizeMb}MB`,
    );
    return null;
  }

  let asset: MimeBuffer;
  try {
    asset = dataUriToBuffer(url);
  } catch (e) {
    logger.error(
      `[Crawler][${jobId}] Failed to decode data URI ${fileType}: ${e}`,
    );
    return null;
  }

  // Guardrail 2: never trust the declared mediatype for anything but the raster
  // image types we actually serve as banners. Rejects svg/html/etc.;
  // saveAsset's SUPPORTED_ASSET_TYPES check is the backstop.
  const contentType = normalizeContentType(asset.type);
  if (!contentType || !IMAGE_ASSET_TYPES.has(contentType)) {
    logger.warn(
      `[Crawler][${jobId}] Skipping data URI ${fileType} with unsupported content type: ${contentType}`,
    );
    return null;
  }

  if (asset.byteLength > maxBytes) {
    logger.warn(
      `[Crawler][${jobId}] Skipping data URI ${fileType}: decoded size (${asset.byteLength} bytes) exceeds maximum allowed size of ${serverConfig.maxAssetSizeMb}MB`,
    );
    return null;
  }

  const { data: quotaApproved, error: quotaError } = await tryCatch(
    QuotaService.checkStorageQuota(db, userId, asset.byteLength),
  );
  if (quotaError) {
    logger.warn(
      `[Crawler][${jobId}] Skipping data URI ${fileType} storage due to quota exceeded: ${quotaError.message}`,
    );
    return null;
  }

  const assetId = newAssetId();
  await saveAsset({
    userId,
    assetId,
    metadata: { contentType },
    asset,
    quotaApproved,
  });
  logger.info(
    `[Crawler][${jobId}] Stored data URI ${fileType} as assetId: ${assetId} (${asset.byteLength} bytes)`,
  );
  return { assetId, userId, contentType, size: asset.byteLength };
}

export async function downloadAndStoreFile(
  url: string,
  userId: string,
  jobId: string,
  fileType: string,
  abortSignal: AbortSignal,
  runProxy: RunProxyConfig,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.downloadAndStoreFile",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
        "user.id": userId,
        "asset.type": fileType,
      },
    },
    async () => {
      let assetPath: string | undefined;
      try {
        if (url.startsWith("data:")) {
          return await storeDataUriAsset(url, userId, jobId, fileType);
        }
        logger.info(
          `[Crawler][${jobId}] Downloading ${fileType} from "${truncateUrl(url)}"`,
        );
        const response = await fetchWithProxy(
          url,
          {
            signal: abortSignal,
          },
          runProxy,
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
    },
  );
}

export async function downloadAndStoreImage(
  url: string,
  userId: string,
  jobId: string,
  abortSignal: AbortSignal,
  runProxy: RunProxyConfig,
) {
  if (!serverConfig.crawler.downloadBannerImage) {
    logger.info(
      `[Crawler][${jobId}] Skipping downloading the image as per the config.`,
    );
    return null;
  }
  return downloadAndStoreFile(
    url,
    userId,
    jobId,
    "image",
    abortSignal,
    runProxy,
  );
}

export async function archiveWebpage(
  html: string,
  url: string,
  userId: string,
  jobId: string,
  abortSignal: AbortSignal,
  runProxy: RunProxyConfig,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.archiveWebpage",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
        "user.id": userId,
      },
    },
    async () => {
      logger.info(`[Crawler][${jobId}] Will attempt to archive page ...`);

      {
        // Archival is a heavy operation, so we need to check if the user is within reasonable quota before proceeding
        const { error: quotaError } = await tryCatch(
          QuotaService.checkStorageQuota(db, userId, /* estimated size */ 1024),
        );
        if (quotaError) {
          logger.warn(
            `[Crawler][${jobId}] Skipping archival as the user has exceeded their quota: ${quotaError.message}`,
          );
          return null;
        }
      }

      const assetId = newAssetId();
      const assetPath = path.join(os.tmpdir(), assetId);

      let res = await execa({
        input: html,
        cancelSignal: abortSignal,
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
    },
  );
}

export type StoreHtmlResult =
  | { result: "stored"; assetId: string; size: number }
  | { result: "store_inline" }
  | { result: "not_stored" };

export async function storeHtmlContent(
  htmlContent: string | undefined,
  userId: string,
  jobId: string,
): Promise<StoreHtmlResult> {
  return await withSpan(
    tracer,
    "crawlerWorker.storeHtmlContent",
    {
      attributes: {
        "job.id": jobId,
        "user.id": userId,
        "bookmark.content.size": htmlContent
          ? Buffer.byteLength(htmlContent, "utf8")
          : 0,
      },
    },
    async () => {
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
    },
  );
}
