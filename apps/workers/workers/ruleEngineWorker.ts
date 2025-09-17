import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import { buildImpersonatingAuthedContext } from "trpc";

import type { ZRuleEngineRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import {
  RuleEngineQueue,
  zRuleEngineRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import { RuleEngine } from "@karakeep/trpc/lib/ruleEngine";

export class RuleEngineWorker {
  static async build() {
    logger.info("Starting rule engine worker ...");
    const worker = (await getQueueClient())!.createRunner<ZRuleEngineRequest>(
      RuleEngineQueue,
      {
        run: runRuleEngine,
        onComplete: (job) => {
          workerStatsCounter.labels("ruleEngine", "completed").inc();
          const jobId = job.id;
          logger.info(`[ruleEngine][${jobId}] Completed successfully`);
          return Promise.resolve();
        },
        onError: (job) => {
          workerStatsCounter.labels("ruleEngine", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[ruleEngine][${jobId}] rule engine job failed: ${job.error}\n${job.error.stack}`,
          );
          return Promise.resolve();
        },
      },
      {
        concurrency: serverConfig.ruleEngine.numWorkers,
        pollIntervalMs: 1000,
        timeoutSecs: 10,
        validator: zRuleEngineRequestSchema,
      },
    );

    return worker;
  }
}

async function getBookmarkUserId(bookmarkId: string) {
  return await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: {
      userId: true,
    },
  });
}

async function runRuleEngine(job: DequeuedJob<ZRuleEngineRequest>) {
  const jobId = job.id;
  const { bookmarkId, events } = job.data;

  const bookmark = await getBookmarkUserId(bookmarkId);
  if (!bookmark) {
    throw new Error(
      `[ruleEngine][${jobId}] bookmark with id ${bookmarkId} was not found`,
    );
  }
  const userId = bookmark.userId;
  const authedCtx = await buildImpersonatingAuthedContext(userId);

  const ruleEngine = await RuleEngine.forBookmark(authedCtx, bookmarkId);

  const results = (
    await Promise.all(events.map((event) => ruleEngine.onEvent(event)))
  ).flat();

  if (results.length == 0) {
    return;
  }

  const message = results
    .map((result) => `${result.ruleId}, (${result.type}): ${result.message}`)
    .join("\n");

  logger.info(
    `[ruleEngine][${jobId}] Rule engine job for bookmark ${bookmarkId} completed with results: ${message}`,
  );
}
