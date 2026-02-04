import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import { Counter, Gauge, Histogram } from "prom-client";
import { buildImpersonatingTRPCClient } from "trpc";

import { db } from "@karakeep/db";
import {
  bookmarkLinks,
  bookmarks,
  importSessions,
  importStagingBookmarks,
} from "@karakeep/db/schema";
import { LinkCrawlerQueue, OpenAIQueue } from "@karakeep/shared-server";
import logger, { throttledLogger } from "@karakeep/shared/logger";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

// Prometheus metrics
const importStagingProcessedCounter = new Counter({
  name: "import_staging_processed_total",
  help: "Total number of staged items processed",
  labelNames: ["result"],
});

const importStagingStaleResetCounter = new Counter({
  name: "import_staging_stale_reset_total",
  help: "Total number of stale processing items reset to pending",
});

const importStagingInFlightGauge = new Gauge({
  name: "import_staging_in_flight",
  help: "Current number of in-flight items (processing + recently completed)",
});

const importSessionsGauge = new Gauge({
  name: "import_sessions_active",
  help: "Number of active import sessions by status",
  labelNames: ["status"],
});

const importStagingPendingGauge = new Gauge({
  name: "import_staging_pending_total",
  help: "Total number of pending items in staging table",
});

const importBatchDurationHistogram = new Histogram({
  name: "import_batch_duration_seconds",
  help: "Time taken to process a batch of staged items",
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

const backpressureLogger = throttledLogger(60_000);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ImportWorker {
  private running = false;
  private pollIntervalMs = 5000;

  // Backpressure settings
  private maxInFlight = 50;
  private batchSize = 10;
  private staleThresholdMs = 60 * 60 * 1000; // 1 hour

  async start() {
    this.running = true;
    let iterationCount = 0;

    logger.info("[import] Starting import polling worker");

    while (this.running) {
      try {
        // Periodically reset stale processing items (every 60 iterations ~= 1 min)
        if (iterationCount % 60 === 0) {
          await this.resetStaleProcessingItems();
        }
        iterationCount++;

        // Check if any processing items have completed downstream work
        await this.checkAndCompleteProcessingItems();

        const processed = await this.processBatch();
        if (processed === 0) {
          await this.checkAndCompleteIdleSessions();
          await this.updateGauges();
          // Nothing to do, wait before polling again
          await sleep(this.pollIntervalMs);
        } else {
          await this.updateGauges();
        }
      } catch (error) {
        logger.error(`[import] Error in polling loop: ${error}`);
        await sleep(this.pollIntervalMs);
      }
    }
  }

  stop() {
    logger.info("[import] Stopping import polling worker");
    this.running = false;
  }

  private async processBatch(): Promise<number> {
    const countPendingItems = await this.countPendingItems();
    importStagingPendingGauge.set(countPendingItems);
    if (countPendingItems === 0) {
      // Nothing to do, wait before polling again
      return 0;
    }

    // 1. Check backpressure - inflight items + queue sizes
    const availableCapacity = await this.getAvailableCapacity();

    if (availableCapacity <= 0) {
      // At capacity, wait before trying again
      backpressureLogger(
        "info",
        `[import] Pending import items: ${countPendingItems}, but current capacity is ${availableCapacity}. Will wait until capacity is available.`,
      );
      return 0;
    }

    // 2. Get candidate IDs with fair scheduling across users
    const batchLimit = Math.min(this.batchSize, availableCapacity);
    const candidateIds = await this.getNextBatchFairly(batchLimit);

    if (candidateIds.length === 0) return 0;

    // 3. Atomically claim rows - only rows still pending will be claimed
    // This prevents race conditions where multiple workers select the same rows
    const batch = await db
      .update(importStagingBookmarks)
      .set({ status: "processing", processingStartedAt: new Date() })
      .where(
        and(
          eq(importStagingBookmarks.status, "pending"),
          inArray(importStagingBookmarks.id, candidateIds),
        ),
      )
      .returning();

    // If no rows were claimed (another worker got them first), skip processing
    if (batch.length === 0) return 0;

    const batchTimer = importBatchDurationHistogram.startTimer();

    // 4. Mark session(s) as running (using claimed rows, not candidates)
    const sessionIds = [...new Set(batch.map((b) => b.importSessionId))];
    await db
      .update(importSessions)
      .set({ status: "running" })
      .where(
        and(
          inArray(importSessions.id, sessionIds),
          eq(importSessions.status, "pending"),
        ),
      );

    // 5. Process in parallel
    await Promise.allSettled(
      batch.map((staged) => this.processOneBookmark(staged)),
    );

    // 6. Check if any sessions are now complete
    await this.checkAndCompleteEmptySessions(sessionIds);

    batchTimer(); // Record batch duration

    return batch.length;
  }

  private async updateGauges() {
    // Update active sessions gauge by status
    const sessions = await db
      .select({
        status: importSessions.status,
        count: count(),
      })
      .from(importSessions)
      .where(
        inArray(importSessions.status, [
          "staging",
          "pending",
          "running",
          "paused",
        ]),
      )
      .groupBy(importSessions.status);

    // Reset all status gauges to 0 first
    for (const status of ["staging", "pending", "running", "paused"]) {
      importSessionsGauge.set({ status }, 0);
    }

    // Set actual values
    for (const s of sessions) {
      importSessionsGauge.set({ status: s.status }, s.count);
    }
  }

  private async checkAndCompleteIdleSessions() {
    const sessions = await db
      .select({ id: importSessions.id })
      .from(importSessions)
      .where(inArray(importSessions.status, ["pending", "running"]));

    const sessionIds = sessions.map((session) => session.id);
    if (sessionIds.length === 0) {
      return;
    }

    await this.checkAndCompleteEmptySessions(sessionIds);
  }

  private async countPendingItems(): Promise<number> {
    const res = await db
      .select({ count: count() })
      .from(importStagingBookmarks)
      .where(eq(importStagingBookmarks.status, "pending"));
    return res[0]?.count ?? 0;
  }

  private async getNextBatchFairly(limit: number): Promise<string[]> {
    // Query pending item IDs from active sessions, ordered by:
    // 1. User's last-served timestamp (fairness)
    // 2. Staging item creation time (FIFO within user)
    // Returns only IDs - actual rows will be fetched atomically during claim
    const results = await db
      .select({
        id: importStagingBookmarks.id,
      })
      .from(importStagingBookmarks)
      .innerJoin(
        importSessions,
        eq(importStagingBookmarks.importSessionId, importSessions.id),
      )
      .where(
        and(
          eq(importStagingBookmarks.status, "pending"),
          inArray(importSessions.status, ["pending", "running"]),
        ),
      )
      .orderBy(importSessions.lastProcessedAt, importStagingBookmarks.createdAt)
      .limit(limit);

    return results.map((r) => r.id);
  }

  private async attachBookmarkToLists(
    caller: Awaited<ReturnType<typeof buildImpersonatingTRPCClient>>,
    session: typeof importSessions.$inferSelect,
    staged: typeof importStagingBookmarks.$inferSelect,
    bookmarkId: string,
  ): Promise<void> {
    const listIds = new Set<string>();

    if (session.rootListId) {
      listIds.add(session.rootListId);
    }

    if (staged.listIds && staged.listIds.length > 0) {
      for (const listId of staged.listIds) {
        listIds.add(listId);
      }
    }

    for (const listId of listIds) {
      try {
        await caller.lists.addToList({ listId, bookmarkId });
      } catch (error) {
        logger.warn(
          `[import] Failed to add bookmark ${bookmarkId} to list ${listId}: ${error}`,
        );
      }
    }
  }

  private async processOneBookmark(
    staged: typeof importStagingBookmarks.$inferSelect,
  ) {
    const session = await db.query.importSessions.findFirst({
      where: eq(importSessions.id, staged.importSessionId),
    });

    if (!session || session.status === "paused") {
      // Session paused mid-batch, reset item to pending
      await db
        .update(importStagingBookmarks)
        .set({ status: "pending" })
        .where(eq(importStagingBookmarks.id, staged.id));
      return;
    }

    try {
      // Use existing tRPC mutation via internal caller
      // Note: Duplicate detection is handled by createBookmark itself
      const caller = await buildImpersonatingTRPCClient(session.userId);

      // Build the request based on bookmark type
      type CreateBookmarkInput = Parameters<
        typeof caller.bookmarks.createBookmark
      >[0];

      const baseRequest = {
        title: staged.title ?? undefined,
        note: staged.note ?? undefined,
        createdAt: staged.sourceAddedAt ?? undefined,
        crawlPriority: "low" as const,
      };

      let bookmarkRequest: CreateBookmarkInput;

      if (staged.type === "link") {
        if (!staged.url) {
          throw new Error("URL is required for link bookmarks");
        }
        bookmarkRequest = {
          ...baseRequest,
          type: BookmarkTypes.LINK,
          url: staged.url,
        };
      } else if (staged.type === "text") {
        if (!staged.content) {
          throw new Error("Content is required for text bookmarks");
        }
        bookmarkRequest = {
          ...baseRequest,
          type: BookmarkTypes.TEXT,
          text: staged.content,
        };
      } else {
        // asset type - skip for now as it needs special handling
        logger.warn(
          `[import] Asset bookmarks not yet supported in import worker: ${staged.id}`,
        );
        await db
          .update(importStagingBookmarks)
          .set({
            status: "failed",
            result: "rejected",
            resultReason: "Asset bookmarks not yet supported",
            completedAt: new Date(),
          })
          .where(eq(importStagingBookmarks.id, staged.id));
        await this.updateSessionLastProcessedAt(staged.importSessionId);
        return;
      }

      const result = await caller.bookmarks.createBookmark(bookmarkRequest);

      // Apply tags via existing mutation (for both new and duplicate bookmarks)
      if (staged.tags && staged.tags.length > 0) {
        await caller.bookmarks.updateTags({
          bookmarkId: result.id,
          attach: staged.tags.map((t) => ({ tagName: t })),
          detach: [],
        });
      }

      // Handle duplicate case (createBookmark returns alreadyExists: true)
      if (result.alreadyExists) {
        await db
          .update(importStagingBookmarks)
          .set({
            status: "completed",
            result: "skipped_duplicate",
            resultReason: "URL already exists",
            resultBookmarkId: result.id,
            completedAt: new Date(),
          })
          .where(eq(importStagingBookmarks.id, staged.id));

        importStagingProcessedCounter.inc({ result: "skipped_duplicate" });
        await this.attachBookmarkToLists(caller, session, staged, result.id);
        await this.updateSessionLastProcessedAt(staged.importSessionId);
        return;
      }

      // Mark as accepted but keep in "processing" until crawl/tag is done
      // The item will be moved to "completed" by checkAndCompleteProcessingItems()
      await db
        .update(importStagingBookmarks)
        .set({
          result: "accepted",
          resultBookmarkId: result.id,
        })
        .where(eq(importStagingBookmarks.id, staged.id));

      await this.attachBookmarkToLists(caller, session, staged, result.id);

      await this.updateSessionLastProcessedAt(staged.importSessionId);
    } catch (error) {
      logger.error(
        `[import] Error processing staged item ${staged.id}: ${error}`,
      );
      await db
        .update(importStagingBookmarks)
        .set({
          status: "failed",
          result: "rejected",
          resultReason: String(error),
          completedAt: new Date(),
        })
        .where(eq(importStagingBookmarks.id, staged.id));

      importStagingProcessedCounter.inc({ result: "rejected" });
      await this.updateSessionLastProcessedAt(staged.importSessionId);
    }
  }

  private async updateSessionLastProcessedAt(sessionId: string) {
    await db
      .update(importSessions)
      .set({ lastProcessedAt: new Date() })
      .where(eq(importSessions.id, sessionId));
  }

  private async checkAndCompleteEmptySessions(sessionIds: string[]) {
    for (const sessionId of sessionIds) {
      const remaining = await db
        .select({ count: count() })
        .from(importStagingBookmarks)
        .where(
          and(
            eq(importStagingBookmarks.importSessionId, sessionId),
            inArray(importStagingBookmarks.status, ["pending", "processing"]),
          ),
        );

      if (remaining[0]?.count === 0) {
        await db
          .update(importSessions)
          .set({ status: "completed" })
          .where(eq(importSessions.id, sessionId));
      }
    }
  }

  /**
   * Check processing items that have a bookmark created and mark them as completed
   * once downstream processing (crawling/tagging) is done.
   */
  private async checkAndCompleteProcessingItems(): Promise<number> {
    // Find processing items where:
    // - A bookmark was created (resultBookmarkId is set)
    // - Downstream processing is complete (crawl/tag not pending)
    const completedItems = await db
      .select({
        id: importStagingBookmarks.id,
        importSessionId: importStagingBookmarks.importSessionId,
      })
      .from(importStagingBookmarks)
      .leftJoin(
        bookmarks,
        eq(bookmarks.id, importStagingBookmarks.resultBookmarkId),
      )
      .leftJoin(
        bookmarkLinks,
        eq(bookmarkLinks.id, importStagingBookmarks.resultBookmarkId),
      )
      .where(
        and(
          eq(importStagingBookmarks.status, "processing"),
          isNotNull(importStagingBookmarks.resultBookmarkId),
          // Crawl is done (not pending) - either success, failure, or null (not a link)
          or(
            isNull(bookmarkLinks.crawlStatus),
            eq(bookmarkLinks.crawlStatus, "success"),
            eq(bookmarkLinks.crawlStatus, "failure"),
          ),
          // Tagging is done (not pending) - either success, failure, or null
          or(
            isNull(bookmarks.taggingStatus),
            eq(bookmarks.taggingStatus, "success"),
            eq(bookmarks.taggingStatus, "failure"),
          ),
        ),
      );

    if (completedItems.length === 0) {
      return 0;
    }

    // Mark them as completed
    await db
      .update(importStagingBookmarks)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(
        inArray(
          importStagingBookmarks.id,
          completedItems.map((i) => i.id),
        ),
      );

    // Increment counter for completed items
    importStagingProcessedCounter.inc(
      { result: "accepted" },
      completedItems.length,
    );

    // Check if any sessions are now complete
    const sessionIds = [
      ...new Set(completedItems.map((i) => i.importSessionId)),
    ];
    await this.checkAndCompleteEmptySessions(sessionIds);

    return completedItems.length;
  }

  /**
   * Backpressure: Calculate available capacity based on number of items in flight and the health of the import queues.
   */
  private async getAvailableCapacity(): Promise<number> {
    const [processingCount, crawlerQueue, openaiQueue] = await Promise.all([
      db
        .select({ count: count() })
        .from(importStagingBookmarks)
        .where(
          and(
            eq(importStagingBookmarks.status, "processing"),
            gt(
              importStagingBookmarks.processingStartedAt,
              new Date(Date.now() - this.staleThresholdMs),
            ),
          ),
        ),
      LinkCrawlerQueue.stats(),
      OpenAIQueue.stats(),
    ]);

    const inFlight = Math.max(
      crawlerQueue.pending + crawlerQueue.running + crawlerQueue.pending_retry,
      openaiQueue.pending + openaiQueue.running + openaiQueue.pending_retry,
      processingCount[0]?.count ?? 0,
    );
    importStagingInFlightGauge.set(inFlight);

    return this.maxInFlight - inFlight;
  }

  /**
   * Reset stale "processing" items back to "pending" so they can be retried.
   * Called periodically to handle crashed workers or stuck items.
   *
   * Only resets items that don't have a resultBookmarkId - those with a bookmark
   * are waiting for downstream processing (crawl/tag), not stale.
   */
  private async resetStaleProcessingItems(): Promise<number> {
    const staleThreshold = new Date(Date.now() - this.staleThresholdMs);

    const staleItems = await db
      .select({ id: importStagingBookmarks.id })
      .from(importStagingBookmarks)
      .where(
        and(
          eq(importStagingBookmarks.status, "processing"),
          lt(importStagingBookmarks.processingStartedAt, staleThreshold),
          // Only reset items that haven't created a bookmark yet
          // Items with a bookmark are waiting for downstream, not stale
          isNull(importStagingBookmarks.resultBookmarkId),
        ),
      );

    if (staleItems.length > 0) {
      logger.warn(
        `[import] Resetting ${staleItems.length} stale processing items`,
      );

      await db
        .update(importStagingBookmarks)
        .set({ status: "pending", processingStartedAt: null })
        .where(
          inArray(
            importStagingBookmarks.id,
            staleItems.map((i) => i.id),
          ),
        );

      importStagingStaleResetCounter.inc(staleItems.length);
      return staleItems.length;
    }

    return 0;
  }
}
