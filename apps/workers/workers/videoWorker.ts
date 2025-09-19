import fs from "fs";
import * as os from "os";
import path from "path";
import { execa } from "execa";
import { workerStatsCounter } from "metrics";

import { db } from "@karakeep/db";
import { AssetTypes } from "@karakeep/db/schema";
import {
  QuotaService,
  StorageQuotaError,
  VideoWorkerQueue,
  ZVideoRequest,
  zvideoRequestSchema,
} from "@karakeep/shared-server";
import {
  ASSET_TYPES,
  newAssetId,
  saveAssetFromFile,
  silentDeleteAsset,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

import { getBookmarkDetails, updateAsset } from "../workerUtils";

const TMP_FOLDER = path.join(os.tmpdir(), "video_downloads");

export class VideoWorker {
  static async build() {
    logger.info("Starting video worker ...");

    return (await getQueueClient())!.createRunner<ZVideoRequest>(
      VideoWorkerQueue,
      {
        run: runWorker,
        onComplete: async (job) => {
          workerStatsCounter.labels("video", "completed").inc();
          const jobId = job.id;
          logger.info(
            `[VideoCrawler][${jobId}] Video Download Completed successfully`,
          );
          return Promise.resolve();
        },
        onError: async (job) => {
          workerStatsCounter.labels("video", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[VideoCrawler][${jobId}] Video Download job failed: ${job.error}`,
          );
          return Promise.resolve();
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.crawler.downloadVideoTimeout,
        concurrency: 1,
        validator: zvideoRequestSchema,
      },
    );
  }
}

function prepareYtDlpArguments(url: string, assetPath: string) {
  const ytDlpArguments = [url];
  if (serverConfig.crawler.maxVideoDownloadSize > 0) {
    ytDlpArguments.push(
      "-f",
      `best[filesize<${serverConfig.crawler.maxVideoDownloadSize}M]`,
    );
  }

  ytDlpArguments.push(...serverConfig.crawler.ytDlpArguments);
  ytDlpArguments.push("-o", assetPath);
  ytDlpArguments.push("--no-playlist");
  return ytDlpArguments;
}

async function runWorker(job: DequeuedJob<ZVideoRequest>) {
  const jobId = job.id;
  const { bookmarkId } = job.data;

  const {
    url,
    userId,
    videoAssetId: oldVideoAssetId,
  } = await getBookmarkDetails(bookmarkId);

  if (!serverConfig.crawler.downloadVideo) {
    logger.info(
      `[VideoCrawler][${jobId}] Skipping video download from "${url}", because it is disabled in the config.`,
    );
    return;
  }

  const videoAssetId = newAssetId();
  let assetPath = `${TMP_FOLDER}/${videoAssetId}`;
  await fs.promises.mkdir(TMP_FOLDER, { recursive: true });

  const ytDlpArguments = prepareYtDlpArguments(url, assetPath);

  try {
    logger.info(
      `[VideoCrawler][${jobId}] Attempting to download a file from "${url}" to "${assetPath}" using the following arguments: "${ytDlpArguments}"`,
    );

    await execa("yt-dlp", ytDlpArguments, {
      cancelSignal: job.abortSignal,
    });
    const downloadPath = await findAssetFile(videoAssetId);
    if (!downloadPath) {
      logger.info(
        "[VideoCrawler][${jobId}] yt-dlp didn't download anything. Skipping ...",
      );
      return;
    }
    assetPath = downloadPath;
  } catch (e) {
    const err = e as Error;
    if (
      err.message.includes("ERROR: Unsupported URL:") ||
      err.message.includes("No media found")
    ) {
      logger.info(
        `[VideoCrawler][${jobId}] Skipping video download from "${url}", because it's not one of the supported yt-dlp URLs`,
      );
      return;
    }
    const genericError = `[VideoCrawler][${jobId}] Failed to download a file from "${url}" to "${assetPath}"`;
    if ("stderr" in err) {
      logger.error(`${genericError}: ${err.stderr}`);
    } else {
      logger.error(genericError);
    }
    await deleteLeftOverAssetFile(jobId, videoAssetId);
    return;
  }

  logger.info(
    `[VideoCrawler][${jobId}] Finished downloading a file from "${url}" to "${assetPath}"`,
  );

  // Get file size and check quota before saving
  const stats = await fs.promises.stat(assetPath);
  const fileSize = stats.size;

  try {
    const quotaApproved = await QuotaService.checkStorageQuota(
      db,
      userId,
      fileSize,
    );

    await saveAssetFromFile({
      userId,
      assetId: videoAssetId,
      assetPath,
      metadata: { contentType: ASSET_TYPES.VIDEO_MP4 },
      quotaApproved,
    });

    await db.transaction(async (txn) => {
      await updateAsset(
        oldVideoAssetId,
        {
          id: videoAssetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_VIDEO,
          contentType: ASSET_TYPES.VIDEO_MP4,
          size: fileSize,
        },
        txn,
      );
    });
    await silentDeleteAsset(userId, oldVideoAssetId);

    logger.info(
      `[VideoCrawler][${jobId}] Finished downloading video from "${url}" and adding it to the database`,
    );
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      logger.warn(
        `[VideoCrawler][${jobId}] Skipping video storage due to quota exceeded: ${error.message}`,
      );
      await deleteLeftOverAssetFile(jobId, videoAssetId);
      return;
    }
    throw error;
  }
}

/**
 * Deletes leftover assets in case the download fails
 *
 * @param jobId the id of the job
 * @param assetId the id of the asset to delete
 */
async function deleteLeftOverAssetFile(
  jobId: string,
  assetId: string,
): Promise<void> {
  let assetFile;
  try {
    assetFile = await findAssetFile(assetId);
  } catch {
    // ignore exception, no asset file was found
    return;
  }
  if (!assetFile) {
    return;
  }
  logger.info(
    `[VideoCrawler][${jobId}] Deleting leftover video asset "${assetFile}".`,
  );
  try {
    await fs.promises.rm(assetFile);
  } catch {
    logger.error(
      `[VideoCrawler][${jobId}] Failed deleting leftover video asset "${assetFile}".`,
    );
  }
}

/**
 * yt-dlp automatically adds a file ending to the passed in filename --> we have to search it again in the folder
 *
 * @param assetId the id of the asset to search
 * @returns the path to the downloaded asset
 */
async function findAssetFile(assetId: string): Promise<string | null> {
  const files = await fs.promises.readdir(TMP_FOLDER);
  for (const file of files) {
    if (file.startsWith(assetId)) {
      return path.join(TMP_FOLDER, file);
    }
  }
  return null;
}
