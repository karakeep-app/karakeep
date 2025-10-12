import { and, eq, inArray } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import cron from "node-cron";
import Parser from "rss-parser";
import { buildImpersonatingTRPCClient } from "trpc";
import { fetchWithProxy } from "utils";
import { z } from "zod";

import type { ZFeedRequestSchema } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { rssFeedImportsTable, rssFeedsTable } from "@karakeep/db/schema";
import { FeedQueue, QuotaService } from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

export const FeedRefreshingWorker = cron.schedule(
  "0 * * * *",
  () => {
    logger.info("[feed] Scheduling feed refreshing jobs ...");
    db.query.rssFeedsTable
      .findMany({
        columns: {
          id: true,
        },
        where: eq(rssFeedsTable.enabled, true),
      })
      .then((feeds) => {
        const currentHour = new Date();
        currentHour.setMinutes(0, 0, 0);
        const hourlyWindow = currentHour.toISOString();

        for (const feed of feeds) {
          const idempotencyKey = `${feed.id}-${hourlyWindow}`;
          FeedQueue.enqueue(
            {
              feedId: feed.id,
            },
            {
              idempotencyKey,
            },
          );
        }
      });
  },
  {
    runOnInit: false,
    scheduled: false,
  },
);

export class FeedWorker {
  static async build() {
    logger.info("Starting feed worker ...");
    const worker = (await getQueueClient())!.createRunner<ZFeedRequestSchema>(
      FeedQueue,
      {
        run: run,
        onComplete: async (job) => {
          workerStatsCounter.labels("feed", "completed").inc();
          const jobId = job.id;
          logger.info(`[feed][${jobId}] Completed successfully`);
          await db
            .update(rssFeedsTable)
            .set({ lastFetchedStatus: "success", lastFetchedAt: new Date() })
            .where(eq(rssFeedsTable.id, job.data?.feedId));
        },
        onError: async (job) => {
          workerStatsCounter.labels("feed", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[feed][${jobId}] Feed fetch job failed: ${job.error}\n${job.error.stack}`,
          );
          if (job.data) {
            await db
              .update(rssFeedsTable)
              .set({ lastFetchedStatus: "failure", lastFetchedAt: new Date() })
              .where(eq(rssFeedsTable.id, job.data?.feedId));
          }
        },
      },
      {
        concurrency: 1,
        pollIntervalMs: 1000,
        timeoutSecs: 30,
      },
    );

    return worker;
  }
}

async function run(req: DequeuedJob<ZFeedRequestSchema>) {
  const jobId = req.id;
  const feed = await db.query.rssFeedsTable.findFirst({
    where: eq(rssFeedsTable.id, req.data.feedId),
  });
  if (!feed) {
    throw new Error(
      `[feed][${jobId}] Feed with id ${req.data.feedId} not found`,
    );
  }

  // If the user doesn't have bookmark quota, don't bother with fetching the feed
  {
    const quotaResult = await QuotaService.canCreateBookmark(db, feed.userId);
    if (!quotaResult.result) {
      logger.debug(
        `[feed][${jobId}] User ${feed.userId} doesn't have enough quota to create bookmarks. Skipping feed fetching.`,
      );
      return;
    }
  }

  logger.info(
    `[feed][${jobId}] Starting fetching feed "${feed.name}" (${feed.id}) ...`,
  );

  const response = await fetchWithProxy(feed.url, {
    signal: AbortSignal.timeout(5000),
    headers: {
      UserAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/rss+xml",
    },
  });
  if (response.status !== 200) {
    throw new Error(
      `[feed][${jobId}] Feed "${feed.name}" (${feed.id}) returned a non-success status: ${response.status}.`,
    );
  }
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("xml")) {
    throw new Error(
      `[feed][${jobId}] Feed "${feed.name}" (${feed.id}) is not a valid RSS feed`,
    );
  }
  const xmlData = await response.text();

  logger.info(
    `[feed][${jobId}] Successfully fetched feed "${feed.name}" (${feed.id}) ...`,
  );

  const parser = new Parser({
    customFields: {
      item: ["id"],
    },
  });
  const unparseFeedData = await parser.parseString(xmlData);

  // Apparently, we can't trust the output of the xml parser. So let's do our own type
  // validation.
  const feedItemsSchema = z.object({
    id: z.coerce.string(),
    link: z.string().optional(),
    guid: z.string().optional(),
  });

  const feedItems = unparseFeedData.items
    .map((i) => feedItemsSchema.safeParse(i))
    .flatMap((i) => (i.success ? [i.data] : []));

  logger.info(
    `[feed][${jobId}] Found ${feedItems.length} entries in feed "${feed.name}" (${feed.id}) ...`,
  );

  if (feedItems.length === 0) {
    logger.info(`[feed][${jobId}] No entries found.`);
    return;
  }

  // For feeds that don't have guids, use the link as the id
  feedItems.forEach((item) => {
    item.guid = item.guid ?? item.id ?? item.link;
  });

  const exitingEntries = await db.query.rssFeedImportsTable.findMany({
    where: and(
      eq(rssFeedImportsTable.rssFeedId, feed.id),
      inArray(
        rssFeedImportsTable.entryId,
        feedItems.map((item) => item.guid).filter((id): id is string => !!id),
      ),
    ),
  });

  const newEntries = feedItems.filter(
    (item) =>
      !exitingEntries.some((entry) => entry.entryId === item.guid) &&
      item.link &&
      item.guid,
  );

  if (newEntries.length === 0) {
    logger.info(
      `[feed][${jobId}] No new entries found in feed "${feed.name}" (${feed.id}).`,
    );
    return;
  }

  logger.info(
    `[feed][${jobId}] Found ${newEntries.length} new entries in feed "${feed.name}" (${feed.id}) ...`,
  );

  const trpcClient = await buildImpersonatingTRPCClient(feed.userId);

  const createdBookmarks = await Promise.allSettled(
    newEntries.map((item) =>
      trpcClient.bookmarks.createBookmark({
        type: BookmarkTypes.LINK,
        url: item.link!,
        source: "rss",
      }),
    ),
  );

  // It's ok if this is not transactional as the bookmarks will get linked in the next iteration.
  await db
    .insert(rssFeedImportsTable)
    .values(
      newEntries.map((item, idx) => {
        const b = createdBookmarks[idx];
        return {
          entryId: item.guid!,
          bookmarkId: b.status === "fulfilled" ? b.value.id : null,
          rssFeedId: feed.id,
        };
      }),
    )
    .onConflictDoNothing();

  logger.info(
    `[feed][${jobId}] Successfully imported ${newEntries.length} new enteries from feed "${feed.name}" (${feed.id}).`,
  );

  return Promise.resolve();
}
