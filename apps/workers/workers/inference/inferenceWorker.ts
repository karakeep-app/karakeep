import { eq } from "drizzle-orm";

import type { ZOpenAIRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import {
  addLogFields,
  OpenAIQueue,
  zOpenAIRequestSchema,
  tagPublishedSummary,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

import { workerStatsCounter } from "../../metrics";
import { withWorkerEventLog, withWorkerTracing } from "../../workerTracing";
import { runSummarization } from "./summarize";
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
    // New summaries publish their own status with a generation fence.
    if (
      request.type === "summary_tags" ||
      (request.type === "summarize" &&
        serverConfig.summary.provider === "notebooklm")
    )
      return;
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

export class OpenAiWorker {
  static async build() {
    logger.info("Starting inference worker ...");
    const worker = (await getQueueClient())!.createRunner<ZOpenAIRequest>(
      OpenAIQueue,
      {
        run: withWorkerTracing(
          "inferenceWorker.run",
          withWorkerEventLog("inferenceWorker.run", runOpenAI),
        ),
        onComplete: async (job) => {
          workerStatsCounter.labels("inference", "completed").inc();
          const jobId = job.id;
          logger.info(`[inference][${jobId}] Completed successfully`);
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
        timeoutSecs:
          serverConfig.summary.provider === "notebooklm"
            ? Math.max(
                serverConfig.inference.jobTimeoutSec,
                serverConfig.summary.jobTimeoutSec + 15,
              )
            : serverConfig.inference.jobTimeoutSec,
      },
    );

    return worker;
  }
}

async function runOpenAI(job: DequeuedJob<ZOpenAIRequest>) {
  const jobId = job.id;

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
  if (request.data.type === "summary_tags") {
    if (!request.data.summaryGeneration)
      throw new Error("Summary tags require a generation");
    if (bookmark)
      await tagPublishedSummary(
        db,
        bookmarkId,
        bookmark.userId,
        request.data.summaryGeneration,
        job.abortSignal,
      );
    return;
  }
  const inferenceClient = InferenceClientFactory.build();
  if (
    !inferenceClient &&
    !(
      serverConfig.summary.provider === "notebooklm" &&
      request.data.type === "summarize"
    )
  ) {
    logger.debug(
      `[inference][${jobId}] No inference client configured, nothing to do now`,
    );
    return;
  }
  switch (request.data.type) {
    case "summarize":
      await runSummarization(bookmarkId, job, inferenceClient);
      break;
    case "tag":
      if (inferenceClient) await runTagging(bookmarkId, job, inferenceClient);
      break;
    default:
      throw new Error(`Unknown inference type: ${request.data.type}`);
  }
}
