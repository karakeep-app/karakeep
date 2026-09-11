import { and, eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import { withWorkerEventLog, withWorkerTracing } from "workerTracing";

import type { ZOpenAIRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import {
  addLogFields,
  OpenAIQueue,
  zOpenAIRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

import { runSummarization, SummarizationOutcome } from "./summarize";
import { runTagging } from "./tagging";

async function attemptMarkStatus(
  jobData: object | undefined,
  status: "success" | "failure",
) {
  if (!jobData) {
    return;
  }
  try {
    const request = zOpenAIRequestSchema.parse(jobData);
    await db
      .update(bookmarks)
      .set({
        ...(request.type === "summarize"
          ? { summarizationStatus: status }
          : {}),
        ...(request.type === "tag" ? { taggingStatus: status } : {}),
      })
      .where(eq(bookmarks.id, request.bookmarkId));
  } catch (e) {
    logger.error(`Something went wrong when marking the tagging status: ${e}`);
  }
}

/**
 * Clears the `pending` status of a job that was skipped without doing any work,
 * so it does not sit as "summarizing" forever. Mirrors what the crawler does
 * when a job will never produce a result.
 */
async function attemptClearPendingStatus(jobData: object | undefined) {
  if (!jobData) {
    return;
  }
  try {
    const request = zOpenAIRequestSchema.parse(jobData);
    if (request.type !== "summarize") {
      return;
    }
    await db
      .update(bookmarks)
      .set({ summarizationStatus: null })
      .where(
        and(
          eq(bookmarks.id, request.bookmarkId),
          eq(bookmarks.summarizationStatus, "pending"),
        ),
      );
  } catch (e) {
    logger.error(
      `Something went wrong when clearing the summarization status: ${e}`,
    );
  }
}

export class OpenAiWorker {
  static async build() {
    logger.info("Starting inference worker ...");
    const worker = (await getQueueClient())!.createRunner<
      ZOpenAIRequest,
      SummarizationOutcome | undefined
    >(
      OpenAIQueue,
      {
        run: withWorkerTracing(
          "inferenceWorker.run",
          withWorkerEventLog("inferenceWorker.run", runOpenAI),
        ),
        onComplete: async (job, result) => {
          workerStatsCounter.labels("inference", "completed").inc();
          const jobId = job.id;
          logger.info(`[inference][${jobId}] Completed successfully`);
          if (result === "skipped") {
            // Nothing was summarized, so recording a success would claim a
            // summary that doesn't exist.
            await attemptClearPendingStatus(job.data);
            return;
          }
          await attemptMarkStatus(job.data, "success");
        },
        onError: async (job) => {
          workerStatsCounter.labels("inference", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[inference][${jobId}] inference job failed: ${job.error}\n${job.error.stack}`,
          );
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("inference", "failed_permanent").inc();
            await attemptMarkStatus(job?.data, "failure");
          }
        },
      },
      {
        concurrency: serverConfig.inference.numWorkers,
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.inference.jobTimeoutSec,
      },
    );

    return worker;
  }
}

async function runOpenAI(
  job: DequeuedJob<ZOpenAIRequest>,
): Promise<SummarizationOutcome | undefined> {
  const jobId = job.id;

  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.debug(
      `[inference][${jobId}] No inference client configured, nothing to do now`,
    );
    return;
  }

  const request = zOpenAIRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(
      `[inference][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
  }

  const { bookmarkId } = request.data;
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: {
      userId: true,
    },
  });

  addLogFields<"inferenceWorker.run">({
    "bookmark.id": bookmarkId,
    "inference.type": request.data.type,
    ...(bookmark ? { "user.id": bookmark.userId } : {}),
  });
  switch (request.data.type) {
    case "summarize":
      return await runSummarization(bookmarkId, job, inferenceClient);
    case "tag":
      await runTagging(bookmarkId, job, inferenceClient);
      return undefined;
    default:
      throw new Error(`Unknown inference type: ${request.data.type}`);
  }
}
