import { and, eq } from "drizzle-orm";

import type { AssetPreprocessingRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarks,
} from "@karakeep/db/schema";
import {
  addLogFields,
  AssetPreprocessingQueue,
  EmbeddingsQueue,
  newAssetId,
  OpenAIQueue,
  QuotaService,
  readAsset,
  saveAsset,
  StorageQuotaError,
  triggerSearchReindex,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { buildOCRPrompt } from "@karakeep/shared/prompts";
import {
  DequeuedJob,
  EnqueueOptions,
  getQueueClient,
} from "@karakeep/shared/queueing";

import type {
  AssetJob,
  AssetProcessor,
  PdfSteps,
  PdfText,
  StepResult,
} from "./assetPreprocessing/common";
import { AssetProcessorUnavailableError } from "./assetPreprocessing/common";
import { workerStatsCounter } from "../metrics";
import { withWorkerEventLog, withWorkerTracing } from "../workerTracing";
import { localAssetProcessor } from "./assetPreprocessing/localAssetProcessor";
import { remoteAssetProcessor } from "./assetPreprocessing/remoteAssetProcessor";

// The PDF parsing, PDF screenshots and OCR (but not the LLM OCR) happen on the
// remote sandbox when there's one.
const assetProcessor: AssetProcessor = serverConfig.sandbox.url
  ? remoteAssetProcessor
  : localAssetProcessor;

export class AssetPreprocessingWorker {
  static async build() {
    logger.info("Starting asset preprocessing worker ...");
    const worker =
      (await getQueueClient())!.createRunner<AssetPreprocessingRequest>(
        AssetPreprocessingQueue,
        {
          run: withWorkerTracing(
            "assetPreprocessingWorker.run",
            withWorkerEventLog("assetPreprocessingWorker.run", run),
          ),
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

            const bookmarkId = job.data?.bookmarkId;
            if (bookmarkId && job.numRetriesLeft == 0) {
              await db.transaction((tx) => {
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

/**
 * Whether an error in a best-effort step (OCR, the PDF screenshot) must still
 * fail the job: a timed-out job must stop rather than enqueue follow-up work
 * next to its own retry, and an unreachable sandbox says nothing about the
 * asset, so the job is retried once it's back.
 */
function mustFailJob(job: AssetJob, e: unknown): boolean {
  return job.abortSignal.aborted || e instanceof AssetProcessorUnavailableError;
}

async function readImageTextWithLLM(
  job: AssetJob,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.warn(
      "[assetPreprocessing] LLM OCR is enabled but no inference client is configured. Falling back to Tesseract.",
    );
    return assetProcessor.readImageText(job, buffer);
  }

  const base64 = buffer.toString("base64");
  const prompt = buildOCRPrompt();

  const response = await inferenceClient.inferFromImage(
    prompt,
    contentType,
    base64,
    {
      schema: null,
      abortSignal: job.abortSignal,
    },
  );

  const extractedText = response.response.trim();
  if (!extractedText) {
    return null;
  }

  return extractedText;
}

async function extractAndSaveImageText(
  job: AssetJob,
  asset: Buffer,
  contentType: string,
  bookmark: Bookmark,
  isFixMode: boolean,
): Promise<boolean> {
  const { jobId } = job;
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

  if (serverConfig.ocr.useLLM) {
    logger.info(
      `[assetPreprocessing][${jobId}] Attempting to extract text from image using LLM OCR.`,
    );
    try {
      imageText = await readImageTextWithLLM(job, asset, contentType);
    } catch (e) {
      if (mustFailJob(job, e)) {
        throw e;
      }
      logger.error(
        `[assetPreprocessing][${jobId}] Failed to read image text with LLM: ${e}`,
      );
    }
  } else {
    logger.info(
      `[assetPreprocessing][${jobId}] Attempting to extract text from image using Tesseract.`,
    );
    try {
      imageText = await assetProcessor.readImageText(job, asset);
    } catch (e) {
      if (mustFailJob(job, e)) {
        throw e;
      }
      logger.error(
        `[assetPreprocessing][${jobId}] Failed to read image text: ${e}`,
      );
    }
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

type Bookmark = NonNullable<Awaited<ReturnType<typeof getBookmark>>>;

async function extractAndSavePDFTextAndScreenshot(
  job: AssetJob,
  asset: Buffer,
  bookmark: Bookmark,
  isFixMode: boolean,
): Promise<boolean> {
  const { jobId } = job;
  const steps: PdfSteps = { text: true, screenshot: true };
  if (isFixMode && bookmark.asset.content) {
    logger.info(
      `[assetPreprocessing][${jobId}] Skipping PDF text extraction as it's already been extracted.`,
    );
    steps.text = false;
  }
  if (
    isFixMode &&
    bookmark.assets.some((r) => r.assetType === AssetTypes.ASSET_SCREENSHOT)
  ) {
    logger.info(
      `[assetPreprocessing][${jobId}] Skipping PDF screenshot generation as it's already been generated.`,
    );
    steps.screenshot = false;
  }
  if (!steps.text && !steps.screenshot) {
    return false;
  }
  logger.info(
    `[assetPreprocessing][${jobId}] Attempting to process the pdf (text: ${steps.text}, screenshot: ${steps.screenshot}).`,
  );
  let savedText = false;
  let savedScreenshot = false;
  // Each result is saved as soon as it's ready, so the text doesn't wait for
  // the screenshot to render. The text comes first: it failing fails the job
  // before the screenshot is saved (or, locally, even rendered), as a
  // screenshot saved before that would be saved again on every retry.
  for await (const r of assetProcessor.processPdf(job, asset, steps)) {
    if (r.step === "text") {
      savedText = await savePDFText(job, bookmark, r.result);
    } else {
      savedScreenshot = await savePDFScreenshot(job, bookmark, r.result);
    }
  }
  return savedText || savedScreenshot;
}

async function savePDFText(
  job: AssetJob,
  bookmark: Bookmark,
  result: StepResult<PdfText>,
): Promise<boolean> {
  const { jobId } = job;
  if (!result.ok) {
    throw new Error(result.error);
  }
  const { text, metadata } = result.value;
  if (!text) {
    throw new Error(
      `[assetPreprocessing][${jobId}] PDF text is empty. Please make sure that the PDF includes text and not just images.`,
    );
  }
  logger.info(
    `[assetPreprocessing][${jobId}] Extracted ${text.length} characters from pdf.`,
  );
  await db
    .update(bookmarkAssets)
    .set({
      content: text,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .where(eq(bookmarkAssets.id, bookmark.id));
  return true;
}

async function savePDFScreenshot(
  job: AssetJob,
  bookmark: Bookmark,
  result: StepResult<Buffer>,
): Promise<boolean> {
  const { jobId } = job;
  if (!result.ok) {
    logger.error(
      `[assetPreprocessing][${jobId}] Failed to generate PDF screenshot: ${result.error}`,
    );
    return false;
  }
  const screenshot = result.value;
  try {
    // Check storage quota before inserting
    const quotaApproved = await QuotaService.checkStorageQuota(
      db,
      bookmark.userId,
      screenshot.byteLength,
    );

    // Store the screenshot
    const assetId = newAssetId();
    const fileName = "screenshot.png";
    const contentType = "image/png";
    await saveAsset({
      userId: bookmark.userId,
      assetId,
      asset: screenshot,
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
      size: screenshot.byteLength,
      fileName,
    });

    logger.info(
      `[assetPreprocessing][${jobId}] Successfully saved PDF screenshot to database`,
    );
    return true;
  } catch (error) {
    if (mustFailJob(job, error)) {
      throw error;
    }
    if (error instanceof StorageQuotaError) {
      logger.warn(
        `[assetPreprocessing][${jobId}] Skipping PDF screenshot due to quota exceeded: ${error.message}`,
      );
      return true; // Return true to indicate the job completed successfully, just skipped the asset
    }
    logger.error(
      `[assetPreprocessing][${jobId}] Failed to save PDF screenshot: ${error}`,
    );
    return false;
  }
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
  const job: AssetJob = { jobId, abortSignal: req.abortSignal };
  const bookmarkId = req.data.bookmarkId;
  addLogFields<"assetPreprocessingWorker.run">({ "bookmark.id": bookmarkId });

  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      asset: true,
      assets: true,
    },
  });

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

  const { asset, metadata } = await readAsset({
    userId: bookmark.userId,
    assetId: bookmark.asset.assetId,
  });

  if (!asset) {
    throw new Error(
      `[assetPreprocessing][${jobId}] AssetId ${bookmark.asset.assetId} for bookmark ${bookmarkId} not found`,
    );
  }

  addLogFields<"assetPreprocessingWorker.run">({
    "user.id": bookmark.userId,
    "asset.type": bookmark.asset.assetType,
    "asset.size": asset.length,
    "asset.content_type": metadata.contentType,
    "preprocessing.fix_mode": isFixMode,
  });

  let anythingChanged = false;
  switch (bookmark.asset.assetType) {
    case "image": {
      const extractedText = await extractAndSaveImageText(
        job,
        asset,
        metadata.contentType,
        bookmark,
        isFixMode,
      );
      anythingChanged ||= extractedText;
      break;
    }
    case "pdf": {
      const extracted = await extractAndSavePDFTextAndScreenshot(
        job,
        asset,
        bookmark,
        isFixMode,
      );
      anythingChanged ||= extracted;
      break;
    }
    default:
      throw new Error(
        `[assetPreprocessing][${jobId}] Unsupported bookmark type`,
      );
  }

  addLogFields<"assetPreprocessingWorker.run">({
    "preprocessing.changed": anythingChanged,
  });

  // Propagate priority to child jobs
  const enqueueOpts: EnqueueOptions = {
    priority: req.priority,
    groupId: bookmark.userId,
  };
  if (!isFixMode || anythingChanged) {
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

    // Update the search index
    await triggerSearchReindex(bookmarkId, enqueueOpts);
  }
}
