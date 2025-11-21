import { eq, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { workerStatsCounter } from "metrics";
import cron from "node-cron";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import type { ZBackupRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  AssetTypes,
  assets,
  backupsTable,
  backupSettingsTable,
} from "@karakeep/db/schema";
import { BackupQueue } from "@karakeep/shared-server";
import { toExportFormat, zExportSchema } from "@karakeep/shared/import-export";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import { AssetAPI } from "@karakeep/shared/assetdb";

import { fetchAllBookmarksForUser } from "./utils/fetchBookmarks";

// Run daily at midnight UTC
export const BackupSchedulingWorker = cron.schedule(
  "0 0 * * *",
  async () => {
    logger.info("[backup] Scheduling daily backup jobs ...");
    try {
      const usersWithBackups = await db.query.backupSettingsTable.findMany({
        columns: {
          userId: true,
          frequency: true,
        },
        where: eq(backupSettingsTable.enabled, true),
      });

      logger.info(
        `[backup] Found ${usersWithBackups.length} users with backups enabled`,
      );

      const now = new Date();
      const currentDay = now.toISOString().split("T")[0]; // YYYY-MM-DD

      for (const setting of usersWithBackups) {
        // Deterministically schedule backups throughout the day based on user ID
        // This spreads the load across 24 hours
        const hash = createHash("sha256")
          .update(setting.userId)
          .digest("hex");
        const hashNum = parseInt(hash.substring(0, 8), 16);

        // For daily: schedule within 24 hours
        // For weekly: only schedule on the user's designated day of week
        let shouldSchedule = false;
        let delayMs = 0;

        if (setting.frequency === "daily") {
          shouldSchedule = true;
          // Spread across 24 hours (86400000 ms)
          delayMs = hashNum % 86400000;
        } else if (setting.frequency === "weekly") {
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
          const idempotencyKey = `${setting.userId}-${currentDay}`;
          await BackupQueue.enqueue(
            {
              userId: setting.userId,
            },
            {
              idempotencyKey,
              delayMs,
            },
          );
          logger.info(
            `[backup] Scheduled backup for user ${setting.userId} with delay ${Math.round(delayMs / 1000 / 60)} minutes`,
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
            await db
              .update(backupsTable)
              .set({
                status: "failure",
                errorMessage: job.error?.message || "Unknown error",
              })
              .where(
                sql`${backupsTable.userId} = ${job.data.userId} AND ${backupsTable.status} = 'pending' AND ${backupsTable.createdAt} > datetime('now', '-1 hour')`,
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

  // Fetch backup settings to check retention
  const settings = await db.query.backupSettingsTable.findFirst({
    where: eq(backupSettingsTable.userId, userId),
  });

  if (!settings || !settings.enabled) {
    logger.info(
      `[backup][${jobId}] Backup settings not found or disabled for user ${userId}. Skipping.`,
    );
    return;
  }

  // Step 1: Fetch all bookmarks for the user
  logger.info(`[backup][${jobId}] Fetching bookmarks for user ${userId} ...`);
  const bookmarks = await fetchAllBookmarksForUser(db, userId);
  logger.info(
    `[backup][${jobId}] Found ${bookmarks.length} bookmarks for user ${userId}`,
  );

  if (bookmarks.length === 0) {
    logger.info(
      `[backup][${jobId}] No bookmarks found for user ${userId}. Skipping backup.`,
    );
    return;
  }

  // Step 2: Convert to export format
  logger.info(`[backup][${jobId}] Building export data ...`);
  const exportData = {
    bookmarks: bookmarks
      .map(toExportFormat)
      .filter((b) => b.content !== null),
  };
  const exportJson = JSON.stringify(exportData, null, 2);
  const exportBuffer = Buffer.from(exportJson, "utf-8");

  // Step 3: Compress the export
  logger.info(`[backup][${jobId}] Compressing export data ...`);
  const compressedBuffer = gzipSync(exportBuffer, { level: 9 });
  const compressedSize = compressedBuffer.length;
  logger.info(
    `[backup][${jobId}] Compressed ${exportBuffer.length} bytes to ${compressedSize} bytes`,
  );

  // Step 4: Store as asset
  logger.info(`[backup][${jobId}] Storing compressed backup as asset ...`);
  const assetId = createId();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `karakeep-backup-${timestamp}.json.gz`;

  await AssetAPI.saveAsset(assetId, userId, compressedBuffer);

  // Step 5: Create asset record
  await db.insert(assets).values({
    id: assetId,
    assetType: AssetTypes.BACKUP,
    size: compressedSize,
    contentType: "application/gzip",
    fileName: fileName,
    bookmarkId: null,
    userId: userId,
  });

  // Step 6: Create backup record
  logger.info(`[backup][${jobId}] Creating backup record ...`);
  await db.insert(backupsTable).values({
    userId: userId,
    assetId: assetId,
    size: compressedSize,
    bookmarkCount: bookmarks.length,
    status: "success",
  });

  logger.info(
    `[backup][${jobId}] Successfully created backup for user ${userId} with ${bookmarks.length} bookmarks (${compressedSize} bytes)`,
  );

  // Step 7: Clean up old backups based on retention
  await cleanupOldBackups(userId, settings.retentionDays, jobId);

  logger.info(`[backup][${jobId}] Backup job completed for user ${userId}`);
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
      where: sql`${backupsTable.userId} = ${userId} AND ${backupsTable.createdAt} < ${cutoffDate}`,
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
        await AssetAPI.deleteAsset(backup.assetId, userId);
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
        sql`${backupsTable.userId} = ${userId} AND ${backupsTable.createdAt} < ${cutoffDate}`,
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
