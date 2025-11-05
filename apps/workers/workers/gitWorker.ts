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
  GitWorkerQueue,
  ZGitRequest,
  zdownloadRequestSchema,
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

const TMP_FOLDER = path.join(os.tmpdir(), "git_downloads");

export class GitWorker {
  static async build() {
    logger.info("Starting git worker ...");

    return (await getQueueClient())!.createRunner<ZGitRequest>(
      GitWorkerQueue,
      {
        run: runWorker,
        onComplete: async (job) => {
          workerStatsCounter.labels("git", "completed").inc();
          const jobId = job.id;
          logger.info(
            `[GitCrawler][${jobId}] Git Download Completed successfully`,
          );
          return Promise.resolve();
        },
        onError: async (job) => {
          workerStatsCounter.labels("git", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[GitCrawler][${jobId}] Git Download job failed: ${job.error}`,
          );
          return Promise.resolve();
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.crawler.downloadGitTimeout,
        concurrency: 1,
        validator: zdownloadRequestSchema,
      },
    );
  }
}

function prepareGitArguments(url: string) {
  const gitArguments = [];
  gitArguments.push("clone");

  if (serverConfig.crawler.gitRepoMirror) {
    gitArguments.push("--mirror");
  } else if (serverConfig.crawler.gitRepoCloneDepth > 0) {
    gitArguments.push(`--depth=${server.config.gitRepoCloneDepth}`);
  }
  gitArguments.push(url);

  return gitArguments;
}

function prepareTarArguments(assetFolder: string, assetPath: string) {
  const tarArguments = [];
  tarArguments.push("czf");

  tarArguments.push(assetPath);
  tarArguments.push("--directory");
  tarArguments.push(assetFolder);
  tarArguments.push(".");

  return tarArguments;
}

async function runWorker(job: DequeuedJob<ZGitRequest>) {
  const jobId = job.id;
  const { bookmarkId } = job.data;

  const {
    url,
    userId,
    gitRepoAssetId: oldGitAssetId,
  } = await getBookmarkDetails(bookmarkId);

  if (!serverConfig.crawler.downloadGitRepo) {
    logger.info(
      `[GitCrawler][${jobId}] Skipping git download from "${url}", because it is disabled in the config.`,
    );
    return;
  }

  const gitAssetId = newAssetId();
  let assetFolder = `${TMP_FOLDER}/${gitAssetId}`;
  let assetPath= `${TMP_FOLDER}/${gitAssetId}.tar.gz`;
  await fs.promises.mkdir(assetFolder, { recursive: true });

  const gitArguments = prepareGitArguments(url);
  const tarArguments = prepareTarArguments(assetFolder, assetPath);

  try {
    logger.info(
      `[GitCrawler][${jobId}] Attempting to clone from "${url}" to "${assetFolder}" using the following arguments: "${gitArguments}"`,
    );

    await execa("git", gitArguments, {
      cwd: assetFolder,
      cancelSignal: job.abortSignal,
    });

    logger.info(
      `[GitCrawler][${jobId}] Attempting to tar from "${assetFolder}" to "${assetPath}" using the following arguments: "${tarArguments}"`,
    );

    await execa("tar", tarArguments, {
      cwd: TMP_FOLDER,
      cancelSignal: job.abortSignal,
    });
  } catch (e) {
    const err = e as Error;
    logger.error(err);
    if (
      err.message.includes("not found")
    ) {
      logger.info(
        `[GitCrawler][${jobId}] Skipping git clone from "${url}", because it's not one of the supported git URLs`,
      );
      return;
    }
    const genericError = `[GitCrawler][${jobId}] Failed to clone repo from "${url}" to "${assetPath}"`;
    if ("stderr" in err) {
      logger.error(`${genericError}: ${err.stderr}`);
    } else {
      logger.error(genericError);
    }
    await deleteLeftOverAssets(jobId, gitAssetId);
    return;
  }

  logger.info(
    `[GitCrawler][${jobId}] Finished downloading a file from "${url}" to "${assetPath}"`,
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
      assetId: gitAssetId,
      assetPath,
      metadata: { contentType: ASSET_TYPES.APPLICATION_GZIP },
      quotaApproved,
    });

    await db.transaction(async (txn) => {
      await updateAsset(
        oldGitAssetId,
        {
          id: gitAssetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_GIT_REPO,
          contentType: ASSET_TYPES.APPLICATION_GZIP,
          size: fileSize,
        },
        txn,
      );
    });
    await silentDeleteAsset(userId, oldGitAssetId);

    logger.info(
      `[GitCrawler][${jobId}] Finished downloading git from "${url}" and adding it to the database`,
    );
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      logger.warn(
        `[GitCrawler][${jobId}] Skipping git storage due to quota exceeded: ${error.message}`,
      );
      await deleteLeftOverAssets(jobId, gitAssetId);
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
async function deleteLeftOverAssets(
  jobId: string,
  gitAssetId: string,
): Promise<void> {
  logger.info(
    `[GitCrawler][${jobId}] Deleting leftover git asset "${assetFile}".`,
  );
  let assetFolder = `${TMP_FOLDER}/${gitAssetId}`;
  let assetPath= `${TMP_FOLDER}/${gitAssetId}.tar.gz`;

  try {
    await fs.promises.rm(assetFolder, { recursive: true });
  } catch {
    logger.error(
      `[GitCrawler][${jobId}] Failed deleting leftover git asset dir "${assetFolder}".`,
    );
  }
  try {
    await fs.promises.rm(assetFile);
  } catch {
    logger.error(
      `[GitCrawler][${jobId}] Failed deleting leftover git asset file "${assetFile}".`,
    );
  }
}
