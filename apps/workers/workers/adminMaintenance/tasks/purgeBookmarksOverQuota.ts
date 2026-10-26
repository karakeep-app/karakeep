import { TRPCError } from "@trpc/server";
import { asc, count, eq } from "drizzle-orm";

import type {
  ZAdminMaintenancePurgeBookmarksOverQuotaTask,
  ZAdminMaintenanceTask,
} from "@karakeep/shared-server";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { db } from "@karakeep/db";
import { bookmarks, users } from "@karakeep/db/schema";
import { AdminMaintenanceQueue } from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import { buildImpersonatingAuthedContext } from "@karakeep/trpc/lib/impersonate";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

const DEFAULT_OPTS = {
  // Bookmarks deleted between re-checks of the user's excess.
  batchSize: 50,
  // Pause between batches to let other writers grab the SQLite write lock
  // and to let the downstream queues (search, embeddings, webhooks) catch up.
  interBatchPauseMs: 250,
  // How long a single run is allowed to keep deleting before it yields by
  // enqueueing a continuation job. Must stay well below the worker's timeout.
  // Yielding keeps a huge purge from monopolizing the (concurrency 1) admin
  // maintenance worker and from being killed mid-way by the job timeout.
  runTimeBudgetMs: 2 * 60 * 1000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns how many bookmarks the user has above their bookmark quota, or
 * null if the user doesn't exist.
 */
async function getNumBookmarksOverQuota(
  userId: string,
): Promise<number | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { bookmarkQuota: true },
  });
  if (!user) {
    return null;
  }
  if (user.bookmarkQuota === null) {
    return 0;
  }
  const [{ numBookmarks }] = await db
    .select({ numBookmarks: count() })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId));
  return Math.max(0, numBookmarks - user.bookmarkQuota);
}

/**
 * Deletes a user's oldest bookmarks until they are back within their bookmark
 * quota.
 *
 * The excess is recomputed from the live state before every batch, so the
 * task carries no cursor: a re-run, retry, duplicate or continuation job
 * simply picks up whatever is still over quota (and quota changes made while
 * the purge is running are respected).
 */
export async function runPurgeBookmarksOverQuotaTask(
  job: DequeuedJob<ZAdminMaintenanceTask>,
  task: ZAdminMaintenancePurgeBookmarksOverQuotaTask,
  opts = DEFAULT_OPTS,
): Promise<void> {
  const jobId = job.id;
  const { userId } = task.args;
  const logPrefix = `[adminMaintenance:purge_bookmarks_over_quota][${jobId}]`;
  const startedAt = Date.now();
  let deletedCount = 0;

  while (true) {
    if (job.abortSignal.aborted) {
      logger.warn(
        `${logPrefix} Aborted after deleting ${deletedCount} bookmarks for user ${userId}`,
      );
      return;
    }

    const numOverQuota = await getNumBookmarksOverQuota(userId);
    if (numOverQuota === null) {
      logger.warn(`${logPrefix} User ${userId} not found, nothing to purge`);
      return;
    }
    if (numOverQuota === 0) {
      break;
    }

    // Only yield after making progress, so that continuations can't loop
    // forever without deleting anything.
    if (deletedCount > 0 && Date.now() - startedAt >= opts.runTimeBudgetMs) {
      await AdminMaintenanceQueue.enqueue(task);
      logger.info(
        `${logPrefix} Yielding after deleting ${deletedCount} bookmarks for user ${userId}. ${numOverQuota} bookmarks still over quota, enqueued a continuation job.`,
      );
      return;
    }

    const batch = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      .orderBy(asc(bookmarks.createdAt), asc(bookmarks.id))
      .limit(Math.min(opts.batchSize, numOverQuota));

    const ctx = await buildImpersonatingAuthedContext(userId);
    for (const { id } of batch) {
      try {
        const bookmark = await Bookmark.fromId(ctx, id, false);
        await bookmark.delete();
        deletedCount++;
      } catch (e) {
        // The user might have deleted it themselves in the meantime.
        if (e instanceof TRPCError && e.code === "NOT_FOUND") {
          continue;
        }
        throw e;
      }
    }

    await sleep(opts.interBatchPauseMs);
  }

  logger.info(
    `${logPrefix} User ${userId} is within their bookmark quota. Deleted ${deletedCount} bookmarks in this run.`,
  );
}
