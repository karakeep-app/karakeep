import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import archiver from "archiver";
import { and, eq, gt, lt } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import cron from "node-cron";

import type { ZBackupRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { assets, AssetTypes, backupsTable, users } from "@karakeep/db/schema";
import { BackupQueue, QuotaService } from "@karakeep/shared-server";
import { deleteAsset, saveAssetFromFile } from "@karakeep/shared/assetdb";
import { toExportFormat } from "@karakeep/shared/import-export";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

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
              idempotencyKey,
              delayMs,
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

          // Mark backup as failed if we have a backup ID
          if (job.data?.userId) {
            // Try to mark any pending backup as failed
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            await db
              .update(backupsTable)
              .set({
                status: "failure",
                errorMessage: job.error?.message || "Unknown error",
              })
              .where(
                and(
                  eq(backupsTable.userId, job.data.userId),
                  eq(backupsTable.status, "pending"),
                  gt(backupsTable.createdAt, oneHourAgo),
                ),
              );
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

  logger.info(`[backup][${jobId}] Starting backup for user ${userId} ...`);

  // Fetch user settings to check if backups are enabled and get retention
  const user = await db.query.users.findFirst({
    columns: {
      id: true,
      backupsEnabled: true,
      backupsRetentionDays: true,
    },
    where: eq(users.id, userId),
  });

  if (!user || !user.backupsEnabled) {
    logger.info(
      `[backup][${jobId}] Backups not enabled for user ${userId}. Skipping.`,
    );
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

  try {
    // Step 1: Stream bookmarks to JSON file
    logger.info(
      `[backup][${jobId}] Streaming bookmarks to JSON file for user ${userId} ...`,
    );
    const ctx = await buildImpersonatingAuthedContext(userId);
    const bookmarkCount = await streamBookmarksToJsonFile(
      ctx,
      tempJsonPath,
      jobId,
    );

    if (bookmarkCount === 0) {
      logger.info(
        `[backup][${jobId}] No bookmarks found for user ${userId}. Skipping backup.`,
      );
      // Clean up temp file
      await unlink(tempJsonPath).catch(() => {
        // Ignore errors during cleanup
      });
      return;
    }

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
    logger.info(`[backup][${jobId}] Checking storage quota ...`);
    const quotaApproval = await QuotaService.checkStorageQuota(
      db,
      userId,
      compressedSize,
    );

    logger.info(`[backup][${jobId}] Storing compressed backup as asset ...`);
    const assetId = createId();
    const fileName = `karakeep-backup-${timestamp}.zip`;

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

    // Step 5: Create backup record
    logger.info(`[backup][${jobId}] Creating backup record ...`);
    await db.insert(backupsTable).values({
      userId: userId,
      assetId: assetId,
      size: compressedSize,
      bookmarkCount: bookmarkCount,
      status: "success",
    });

    logger.info(
      `[backup][${jobId}] Successfully created backup for user ${userId} with ${bookmarkCount} bookmarks (${compressedSize} bytes)`,
    );

    // Step 6: Clean up old backups based on retention
    await cleanupOldBackups(userId, user.backupsRetentionDays, jobId);

    logger.info(`[backup][${jobId}] Backup job completed for user ${userId}`);
  } catch (error) {
    // Clean up temporary files if they exist
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
  ctx: Awaited<ReturnType<typeof buildImpersonatingAuthedContext>>,
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

async function cleanupOldBackups(
  userId: string,
  retentionDays: number,
  jobId: string,
) {
  try {
    logger.info(
      `[backup][${jobId}] Cleaning up backups older than ${retentionDays} days for user ${userId} ...`,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Find old backups
    const oldBackups = await db.query.backupsTable.findMany({
      columns: {
        id: true,
        assetId: true,
        createdAt: true,
      },
      where: and(
        eq(backupsTable.userId, userId),
        lt(backupsTable.createdAt, cutoffDate),
      ),
    });

    if (oldBackups.length === 0) {
      logger.info(
        `[backup][${jobId}] No old backups to clean up for user ${userId}`,
      );
      return;
    }

    logger.info(
      `[backup][${jobId}] Found ${oldBackups.length} old backups to delete for user ${userId}`,
    );

    // Delete assets first
    for (const backup of oldBackups) {
      try {
        await deleteAsset({
          userId,
          assetId: backup.assetId,
        });
        logger.info(
          `[backup][${jobId}] Deleted asset ${backup.assetId} for backup ${backup.id}`,
        );
      } catch (error) {
        logger.warn(
          `[backup][${jobId}] Failed to delete asset ${backup.assetId}: ${error}`,
        );
      }
    }

    // Delete backup records
    await db
      .delete(backupsTable)
      .where(
        and(
          eq(backupsTable.userId, userId),
          lt(backupsTable.createdAt, cutoffDate),
        ),
      );

    logger.info(
      `[backup][${jobId}] Successfully cleaned up ${oldBackups.length} old backups for user ${userId}`,
    );
  } catch (error) {
    logger.error(
      `[backup][${jobId}] Error cleaning up old backups for user ${userId}: ${error}`,
    );
  }
}
