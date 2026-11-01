import { TRPCError } from "@trpc/server";
import { asc, lte } from "drizzle-orm";

import type { ZAdminMaintenanceTask } from "@karakeep/shared-server";
import type { AuthedContext } from "@karakeep/trpc";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import { AdminMaintenanceQueue } from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import { buildImpersonatingAuthedContext } from "@karakeep/trpc/lib/impersonate";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

const DEFAULT_OPTS = {
  batchSize: 50,
  // Pause between batches to let other writers grab the SQLite write lock
  // and to let the downstream queues (search, embeddings, webhooks) catch up.
  interBatchPauseMs: 250,
  // Same as the quota purge: yield with a continuation job well before the
  // worker's timeout.
  runTimeBudgetMs: 2 * 60 * 1000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Permanently deletes the bookmarks that have been in the trash for longer
 * than the retention period.
 */
export async function runPurgeExpiredTrashTask(
  job: DequeuedJob<ZAdminMaintenanceTask>,
  opts = DEFAULT_OPTS,
): Promise<void> {
  const logPrefix = `[adminMaintenance:purge_expired_trash][${job.id}]`;
  const startedAt = Date.now();
  const userContexts = new Map<string, AuthedContext>();
  let deletedCount = 0;

  while (true) {
    if (job.abortSignal.aborted) {
      logger.warn(
        `${logPrefix} Aborted after deleting ${deletedCount} bookmarks`,
      );
      return;
    }

    const now = new Date();
    const batch = await db
      .select({ id: bookmarks.id, userId: bookmarks.userId })
      .from(bookmarks)
      .where(lte(bookmarks.deleteAt, now))
      .orderBy(asc(bookmarks.deleteAt))
      .limit(opts.batchSize);
    if (batch.length === 0) {
      break;
    }

    if (deletedCount > 0 && Date.now() - startedAt >= opts.runTimeBudgetMs) {
      await AdminMaintenanceQueue.enqueue({ type: "purge_expired_trash" });
      logger.info(
        `${logPrefix} Yielding after deleting ${deletedCount} bookmarks, enqueued a continuation job.`,
      );
      return;
    }

    for (const { id, userId } of batch) {
      let ctx = userContexts.get(userId);
      if (!ctx) {
        ctx = await buildImpersonatingAuthedContext(userId);
        userContexts.set(userId, ctx);
      }
      try {
        const bookmark = await Bookmark.fromId(ctx, id, false);
        // The user might have restored it in the meantime, so the expiry is
        // checked again as part of the delete itself.
        if (await bookmark.delete({ trashedBefore: now })) {
          deletedCount++;
        }
      } catch (e) {
        if (e instanceof TRPCError && e.code === "NOT_FOUND") {
          continue;
        }
        throw e;
      }
    }

    await sleep(opts.interBatchPauseMs);
  }

  logger.info(
    `${logPrefix} Permanently deleted ${deletedCount} bookmarks from the trash.`,
  );
}
