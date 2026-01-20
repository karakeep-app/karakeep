import os from "os";
import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import PDFParser from "pdf2json";
import { fromBuffer } from "pdf2pic";
import { createWorker } from "tesseract.js";
import { withWorkerTracing } from "workerTracing";

import type { AssetPreprocessingRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarks,
} from "@karakeep/db/schema";
import {
  AssetPreprocessingQueue,
  OpenAIQueue,
  QuotaService,
  StorageQuotaError,
  triggerSearchReindex,
} from "@karakeep/shared-server";
import { newAssetId, readAsset, saveAsset } from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import {
  DequeuedJob,
  EnqueueOptions,
  getQueueClient,
} from "@karakeep/shared/queueing";

export class AssetPreprocessingWorker {
  static async build() {
    logger.info("Starting asset preprocessing worker ...");
    const worker =
      (await getQueueClient())!.createRunner<AssetPreprocessingRequest>(
        AssetPreprocessingQueue,
        {
          run: withWorkerTracing("assetPreprocessingWorker.run", run),
          onComplete: async (job) => {
            workerStatsCounter.labels("assetPreprocessing", "completed").inc();
            const jobId = job.id;
            logger.info(
              `[assetPreprocessing][${jobId}] Completed successfully`,
            );
            return Promise.resolve();
          },
          onError: async (job) => {
            workerStatsCounter.labels("assetPreProcessing", "failed").inc();
            if (job.numRetriesLeft == 0) {
              workerStatsCounter
                .labels("assetPreProcessing", "failed_permanent")
                .inc();
            }
            const jobId = job.id;
            logger.error(
              `[assetPreprocessing][${jobId}] Asset preprocessing failed: ${job.error}\n${job.error.stack}`,
            );
            return Promise.resolve();
          },
        },
        {
          concurrency: serverConfig.assetPreprocessing.numWorkers,
          pollIntervalMs: 1000,
          timeoutSecs: serverConfig.assetPreprocessing.jobTimeoutSec,
        },
      );

    return worker;
  }
}

function getAbortError(signal: AbortSignal): Error {
  try {
    signal.throwIfAborted();
  } catch (error) {
    return error as Error;
  }

  const abortError = new Error("The operation was aborted");
  (abortError as { name: string }).name = "AbortError";
  return abortError;
}

function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const onAbort = () => {
      reject(getAbortError(signal));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError";
}

async function readImageText(buffer: Buffer, abortSignal: AbortSignal) {
  abortSignal.throwIfAborted();
  if (serverConfig.ocr.langs.length == 1 && serverConfig.ocr.langs[0] == "") {
    return null;
  }
  const worker = await createWorker(serverConfig.ocr.langs, undefined, {
    cachePath: serverConfig.ocr.cacheDir ?? os.tmpdir(),
  });
  const onAbort = () => {
    void worker.terminate();
  };
  abortSignal.addEventListener("abort", onAbort, { once: true });
  try {
    const ret = await Promise.race([
      worker.recognize(buffer),
      abortPromise(abortSignal),
    ]);
    abortSignal.throwIfAborted();
    if (ret.data.confidence <= serverConfig.ocr.confidenceThreshold) {
      return null;
    }
    return ret.data.text;
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
    await worker.terminate();
  }
}

async function readPDFText(
  buffer: Buffer,
  abortSignal: AbortSignal,
): Promise<{
  text: string;
  metadata: Record<string, object>;
}> {
  abortSignal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, true);
    const parserCleanup = pdfParser as unknown as {
      removeAllListeners?: () => void;
      destroy?: () => void;
    };
    const cleanup = () => {
      parserCleanup.removeAllListeners?.();
      abortSignal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      if (typeof parserCleanup.destroy === "function") {
        try {
          parserCleanup.destroy();
        } catch (error) {
          logger.warn(
            "[assetPreprocessing] Failed to destroy pdf parser on abort:",
            error,
          );
        }
      }
      reject(getAbortError(abortSignal));
    };
    pdfParser.on("pdfParser_dataError", (error) => {
      cleanup();
      reject(error);
    });
    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      cleanup();
      resolve({
        text: pdfParser.getRawTextContent(),
        metadata: pdfData.Meta,
      });
    });
    abortSignal.addEventListener("abort", onAbort, { once: true });
    try {
      pdfParser.parseBuffer(buffer);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function extractAndSavePDFScreenshot(
  jobId: string,
  asset: Buffer,
  bookmark: NonNullable<Awaited<ReturnType<typeof getBookmark>>>,
  isFixMode: boolean,
  abortSignal: AbortSignal,
): Promise<boolean> {
  abortSignal.throwIfAborted();
  {
    const alreadyHasScreenshot =
      bookmark.assets.find(
        (r) => r.assetType === AssetTypes.ASSET_SCREENSHOT,
      ) !== undefined;
    if (alreadyHasScreenshot && isFixMode) {
      logger.info(
        `[assetPreprocessing][${jobId}] Skipping PDF screenshot generation as it's already been generated.`,
      );
      return false;
    }
  }
  logger.info(
    `[assetPreprocessing][${jobId}] Attempting to generate PDF screenshot for bookmarkId: ${bookmark.id}`,
  );
  try {
    abortSignal.throwIfAborted();
    /**
     * If you encountered any issues with this library, make sure you have ghostscript and graphicsmagick installed following this URL
     * https://github.com/yakovmeister/pdf2image/blob/HEAD/docs/gm-installation.md
     */
    const screenshot = await Promise.race([
      fromBuffer(asset, {
        density: 100,
        quality: 100,
        format: "png",
        preserveAspectRatio: true,
      })(1, { responseType: "buffer" }),
      abortPromise(abortSignal),
    ]);

    if (!screenshot.buffer) {
      logger.error(
        `[assetPreprocessing][${jobId}] Failed to generate PDF screenshot`,
      );
      return false;
    }

    // Check storage quota before inserting
    abortSignal.throwIfAborted();
    const quotaApproved = await QuotaService.checkStorageQuota(
      db,
      bookmark.userId,
      screenshot.buffer.byteLength,
    );

    // Store the screenshot
    abortSignal.throwIfAborted();
    const assetId = newAssetId();
    const fileName = "screenshot.png";
    const contentType = "image/png";
    await saveAsset({
      userId: bookmark.userId,
      assetId,
      asset: screenshot.buffer,
      metadata: {
        contentType,
        fileName,
      },
      quotaApproved,
    });

    // Insert into database
    await db.insert(assets).values({
      id: assetId,
      bookmarkId: bookmark.id,
      userId: bookmark.userId,
      assetType: AssetTypes.ASSET_SCREENSHOT,
      contentType,
      size: screenshot.buffer.byteLength,
      fileName,
    });

    logger.info(
      `[assetPreprocessing][${jobId}] Successfully saved PDF screenshot to database`,
    );
    return true;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (error instanceof StorageQuotaError) {
      logger.warn(
        `[assetPreprocessing][${jobId}] Skipping PDF screenshot due to quota exceeded: ${error.message}`,
      );
      return true; // Return true to indicate the job completed successfully, just skipped the asset
    }
    logger.error(
      `[assetPreprocessing][${jobId}] Failed to process PDF screenshot: ${error}`,
    );
    return false;
  }
}

async function extractAndSaveImageText(
  jobId: string,
  asset: Buffer,
  bookmark: NonNullable<Awaited<ReturnType<typeof getBookmark>>>,
  isFixMode: boolean,
  abortSignal: AbortSignal,
): Promise<boolean> {
  abortSignal.throwIfAborted();
  {
    const alreadyHasText = !!bookmark.asset.content;
    if (alreadyHasText && isFixMode) {
      logger.info(
        `[assetPreprocessing][${jobId}] Skipping image text extraction as it's already been extracted.`,
      );
      return false;
    }
  }
  let imageText = null;
  logger.info(
    `[assetPreprocessing][${jobId}] Attempting to extract text from image.`,
  );
  try {
    imageText = await readImageText(asset, abortSignal);
  } catch (e) {
    if (isAbortError(e)) {
      throw e;
    }
    logger.error(
      `[assetPreprocessing][${jobId}] Failed to read image text: ${e}`,
    );
  }
  if (!imageText) {
    return false;
  }

  logger.info(
    `[assetPreprocessing][${jobId}] Extracted ${imageText.length} characters from image.`,
  );
  await db
    .update(bookmarkAssets)
    .set({
      content: imageText,
      metadata: null,
    })
    .where(eq(bookmarkAssets.id, bookmark.id));
  return true;
}

async function extractAndSavePDFText(
  jobId: string,
  asset: Buffer,
  bookmark: NonNullable<Awaited<ReturnType<typeof getBookmark>>>,
  isFixMode: boolean,
  abortSignal: AbortSignal,
): Promise<boolean> {
  abortSignal.throwIfAborted();
  {
    const alreadyHasText = !!bookmark.asset.content;
    if (alreadyHasText && isFixMode) {
      logger.info(
        `[assetPreprocessing][${jobId}] Skipping PDF text extraction as it's already been extracted.`,
      );
      return false;
    }
  }
  logger.info(
    `[assetPreprocessing][${jobId}] Attempting to extract text from pdf.`,
  );
  const pdfParse = await readPDFText(asset, abortSignal);
  if (!pdfParse?.text) {
    throw new Error(
      `[assetPreprocessing][${jobId}] PDF text is empty. Please make sure that the PDF includes text and not just images.`,
    );
  }
  logger.info(
    `[assetPreprocessing][${jobId}] Extracted ${pdfParse.text.length} characters from pdf.`,
  );
  await db
    .update(bookmarkAssets)
    .set({
      content: pdfParse.text,
      metadata: pdfParse.metadata ? JSON.stringify(pdfParse.metadata) : null,
    })
    .where(eq(bookmarkAssets.id, bookmark.id));
  return true;
}

async function getBookmark(bookmarkId: string) {
  return db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      asset: true,
      assets: true,
    },
  });
}

async function run(req: DequeuedJob<AssetPreprocessingRequest>) {
  const isFixMode = req.data.fixMode;
  const jobId = req.id;
  const bookmarkId = req.data.bookmarkId;

  req.abortSignal.throwIfAborted();
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      asset: true,
      assets: true,
    },
  });

  req.abortSignal.throwIfAborted();

  logger.info(
    `[assetPreprocessing][${jobId}] Starting an asset preprocessing job for bookmark with id "${bookmarkId}"`,
  );

  if (!bookmark) {
    throw new Error(`[assetPreprocessing][${jobId}] Bookmark not found`);
  }

  if (!bookmark.asset) {
    throw new Error(
      `[assetPreprocessing][${jobId}] Bookmark is not an asset (not an image or pdf)`,
    );
  }

  const { asset } = await readAsset({
    userId: bookmark.userId,
    assetId: bookmark.asset.assetId,
  });

  req.abortSignal.throwIfAborted();
  if (!asset) {
    throw new Error(
      `[assetPreprocessing][${jobId}] AssetId ${bookmark.asset.assetId} for bookmark ${bookmarkId} not found`,
    );
  }

  let anythingChanged = false;
  switch (bookmark.asset.assetType) {
    case "image": {
      const extractedText = await extractAndSaveImageText(
        jobId,
        asset,
        bookmark,
        isFixMode,
        req.abortSignal,
      );
      anythingChanged ||= extractedText;
      break;
    }
    case "pdf": {
      const extractedText = await extractAndSavePDFText(
        jobId,
        asset,
        bookmark,
        isFixMode,
        req.abortSignal,
      );
      const extractedScreenshot = await extractAndSavePDFScreenshot(
        jobId,
        asset,
        bookmark,
        isFixMode,
        req.abortSignal,
      );
      anythingChanged ||= extractedText || extractedScreenshot;
      break;
    }
    default:
      throw new Error(
        `[assetPreprocessing][${jobId}] Unsupported bookmark type`,
      );
  }

  // Propagate priority to child jobs
  const enqueueOpts: EnqueueOptions = {
    priority: req.priority,
    groupId: bookmark.userId,
  };
  if (!isFixMode || anythingChanged) {
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

    // Update the search index
    await triggerSearchReindex(bookmarkId, enqueueOpts);
  }
}
