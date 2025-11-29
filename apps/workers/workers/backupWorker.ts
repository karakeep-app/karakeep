import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import archiver from "archiver";
import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import cron from "node-cron";

import type { ZBackupRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { assets, AssetTypes, users } from "@karakeep/db/schema";
import { BackupQueue, QuotaService } from "@karakeep/shared-server";
import { saveAssetFromFile } from "@karakeep/shared/assetdb";
import { toExportFormat } from "@karakeep/shared/import-export";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import { AuthedContext } from "@karakeep/trpc";
import { Backup } from "@karakeep/trpc/models/backups";

import { buildImpersonatingAuthedContext } from "../trpc";
import { fetchBookmarksInBatches } from "./utils/fetchBookmarks";

// Run daily at midnight UTC
export const BackupSchedulingWorker = cron.schedule(
  "0 0 * * *",
  async () => {
    logger.info("[backup] Scheduling daily backup jobs ...");
    try {
      const usersWithBackups = await db.query.users.findMany({
        columns: {
          id: true,
          backupsFrequency: true,
        },
        where: eq(users.backupsEnabled, true),
      });

      logger.info(
        `[backup] Found ${usersWithBackups.length} users with backups enabled`,
      );

      const now = new Date();
      const currentDay = now.toISOString().split("T")[0]; // YYYY-MM-DD

      for (const user of usersWithBackups) {
        // Deterministically schedule backups throughout the day based on user ID
        // This spreads the load across 24 hours
        const hash = createHash("sha256").update(user.id).digest("hex");
        const hashNum = parseInt(hash.substring(0, 8), 16);

        // For daily: schedule within 24 hours
        // For weekly: only schedule on the user's designated day of week
        let shouldSchedule = false;
        let delayMs = 0;

        if (user.backupsFrequency === "daily") {
          shouldSchedule = true;
          // Spread across 24 hours (86400000 ms)
          delayMs = hashNum % 86400000;
        } else if (user.backupsFrequency === "weekly") {
          // Use hash to determine day of week (0-6)
          const userDayOfWeek = hashNum % 7;
          const currentDayOfWeek = now.getDay();

          if (userDayOfWeek === currentDayOfWeek) {
            shouldSchedule = true;
            // Spread across 24 hours
            delayMs = hashNum % 86400000;
          }
        }

        if (shouldSchedule) {
          const idempotencyKey = `${user.id}-${currentDay}`;

          await BackupQueue.enqueue(
            {
              userId: user.id,
            },
            {
              delayMs,
              idempotencyKey,
            },
          );

          logger.info(
            `[backup] Scheduled backup for user ${user.id} with delay ${Math.round(delayMs / 1000 / 60)} minutes`,
          );
        }
      }

      logger.info("[backup] Finished scheduling backup jobs");
    } catch (error) {
      logger.error(`[backup] Error scheduling backup jobs: ${error}`);
    }
  },
  {
    runOnInit: false,
    scheduled: false,
  },
);

export class BackupWorker {
  static async build() {
    logger.info("Starting backup worker ...");
    const worker = (await getQueueClient())!.createRunner<ZBackupRequest>(
      BackupQueue,
      {
        run: run,
        onComplete: async (job) => {
          workerStatsCounter.labels("backup", "completed").inc();
          const jobId = job.id;
          logger.info(`[backup][${jobId}] Completed successfully`);
        },
        onError: async (job) => {
          workerStatsCounter.labels("backup", "failed").inc();
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("backup", "failed_permanent").inc();
          }
          const jobId = job.id;
          logger.error(
            `[backup][${jobId}] Backup job failed: ${job.error}\n${job.error?.stack}`,
          );

          // Mark backup as failed
          if (job.data?.backupId && job.data?.userId) {
            try {
              const authCtx = await buildImpersonatingAuthedContext(
                job.data.userId,
              );
              const backup = await Backup.fromId(authCtx, job.data.backupId);
              await backup.update({
                status: "failure",
                errorMessage: job.error?.message || "Unknown error",
              });
            } catch (err) {
              logger.error(
                `[backup][${jobId}] Failed to mark backup as failed: ${err}`,
              );
            }
          }
        },
      },
      {
        concurrency: 2, // Process 2 backups at a time
        pollIntervalMs: 5000,
        timeoutSecs: 600, // 10 minutes timeout for large exports
      },
    );

    return worker;
  }
}

async function run(req: DequeuedJob<ZBackupRequest>) {
  const jobId = req.id;
  const userId = req.data.userId;
  const backupId = req.data.backupId;

  logger.info(`[backup][${jobId}] Starting backup for user ${userId} ...`);

  // Fetch user settings to check if backups are enabled and get retention
  const user = await db.query.users.findFirst({
    columns: {
      id: true,
      backupsRetentionDays: true,
    },
    where: eq(users.id, userId),
  });

  if (!user) {
    logger.info(`[backup][${jobId}] User not found: ${userId}. Skipping.`);
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tempJsonPath = join(
    tmpdir(),
    `karakeep-backup-${userId}-${timestamp}.json`,
  );
  const tempZipPath = join(
    tmpdir(),
    `karakeep-backup-${userId}-${timestamp}.zip`,
  );

  let backup: Backup | null = null;

  try {
    // Step 1: Stream bookmarks to JSON file
    const ctx = await buildImpersonatingAuthedContext(userId);
    const backupInstance = await (backupId
      ? Backup.fromId(ctx, backupId)
      : Backup.create(ctx));
    backup = backupInstance;
    // Ensure backupId is attached to job data so error handler can mark failure.
    req.data.backupId = backupInstance.id;

    const bookmarkCount = await streamBookmarksToJsonFile(
      ctx,
      tempJsonPath,
      jobId,
    );

    logger.info(
      `[backup][${jobId}] Streamed ${bookmarkCount} bookmarks to JSON file`,
    );

    // Step 2: Compress the JSON file as zip
    logger.info(`[backup][${jobId}] Compressing JSON file as zip ...`);
    await createZipArchiveFromFile(tempJsonPath, timestamp, tempZipPath);

    const fileStats = await stat(tempZipPath);
    const compressedSize = fileStats.size;
    const jsonStats = await stat(tempJsonPath);

    logger.info(
      `[backup][${jobId}] Compressed ${jsonStats.size} bytes to ${compressedSize} bytes`,
    );

    // Step 3: Check quota and store as asset
    const quotaApproval = await QuotaService.checkStorageQuota(
      db,
      userId,
      compressedSize,
    );
    const assetId = createId();
    const fileName = `karakeep-backup-${timestamp}.zip`;

    // Step 4: Create asset record
    await db.insert(assets).values({
      id: assetId,
      assetType: AssetTypes.BACKUP,
      size: compressedSize,
      contentType: "application/zip",
      fileName: fileName,
      bookmarkId: null,
      userId: userId,
    });
    await saveAssetFromFile({
      userId,
      assetId,
      assetPath: tempZipPath,
      metadata: {
        contentType: "application/zip",
        fileName,
      },
      quotaApproved: quotaApproval,
    });

    // Step 5: Update backup record
    await backupInstance.update({
      size: compressedSize,
      bookmarkCount: bookmarkCount,
      status: "success",
      assetId,
    });

    logger.info(
      `[backup][${jobId}] Successfully created backup for user ${userId} with ${bookmarkCount} bookmarks (${compressedSize} bytes)`,
    );

    // Step 6: Clean up old backups based on retention
    await cleanupOldBackups(ctx, user.backupsRetentionDays, jobId);
  } catch (error) {
    if (backup) {
      try {
        await backup.update({
          status: "failure",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        });
      } catch (updateError) {
        logger.error(
          `[backup][${jobId}] Failed to mark backup ${backup.id} as failed: ${updateError}`,
        );
      }
    }
    throw error;
  } finally {
    // Final cleanup of temporary files
    try {
      await unlink(tempJsonPath);
    } catch {
      // Ignore errors during cleanup
    }
    try {
      await unlink(tempZipPath);
    } catch {
      // Ignore errors during cleanup
    }
  }
}

/**
 * Streams bookmarks to a JSON file in batches to avoid loading everything into memory
 * @returns The total number of bookmarks written
 */
async function streamBookmarksToJsonFile(
  ctx: AuthedContext,
  outputPath: string,
  jobId: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(outputPath, { encoding: "utf-8" });
    let bookmarkCount = 0;
    let isFirst = true;

    writeStream.on("error", reject);

    // Start JSON structure
    writeStream.write('{"bookmarks":[');

    (async () => {
      try {
        for await (const batch of fetchBookmarksInBatches(ctx, 1000)) {
          for (const bookmark of batch) {
            const exported = toExportFormat(bookmark);
            if (exported.content !== null) {
              // Add comma separator for all items except the first
              if (!isFirst) {
                writeStream.write(",");
              }
              writeStream.write(JSON.stringify(exported));
              isFirst = false;
              bookmarkCount++;
            }
          }

          // Log progress every batch
          if (bookmarkCount % 1000 === 0) {
            logger.info(
              `[backup][${jobId}] Streamed ${bookmarkCount} bookmarks so far...`,
            );
          }
        }

        // Close JSON structure
        writeStream.write("]}");
        writeStream.end();

        writeStream.on("finish", () => {
          resolve(bookmarkCount);
        });
      } catch (error) {
        writeStream.destroy();
        reject(error);
      }
    })();
  });
}

/**
 * Creates a zip archive from a JSON file (streaming from disk instead of memory)
 */
async function createZipArchiveFromFile(
  jsonFilePath: string,
  timestamp: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    const output = createWriteStream(outputPath);

    output.on("close", () => {
      resolve();
    });

    output.on("error", reject);
    archive.on("error", reject);

    // Pipe archive data to the file
    archive.pipe(output);

    // Add the JSON file to the zip (streaming from disk)
    const jsonFileName = `karakeep-backup-${timestamp}.json`;
    archive.file(jsonFilePath, { name: jsonFileName });

    archive.finalize();
  });
}

/**
 * Cleans up old backups based on retention policy
 */
async function cleanupOldBackups(
  ctx: AuthedContext,
  retentionDays: number,
  jobId: string,
) {
  try {
    logger.info(
      `[backup][${jobId}] Cleaning up backups older than ${retentionDays} days for user ${ctx.user.id} ...`,
    );

    const oldBackups = await Backup.findOldBackups(ctx, retentionDays);

    if (oldBackups.length === 0) {
      return;
    }

    logger.info(
      `[backup][${jobId}] Found ${oldBackups.length} old backups to delete for user ${ctx.user.id}`,
    );

    // Delete each backup using the model's delete method
    for (const backup of oldBackups) {
      try {
        await backup.delete();
        logger.info(
          `[backup][${jobId}] Deleted backup ${backup.id} for user ${ctx.user.id}`,
        );
      } catch (error) {
        logger.warn(
          `[backup][${jobId}] Failed to delete backup ${backup.id}: ${error}`,
        );
      }
    }

    logger.info(
      `[backup][${jobId}] Successfully cleaned up ${oldBackups.length} old backups for user ${ctx.user.id}`,
    );
  } catch (error) {
    logger.error(
      `[backup][${jobId}] Error cleaning up old backups for user ${ctx.user.id}: ${error}`,
    );
  }
}
