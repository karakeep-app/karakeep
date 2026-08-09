import { eq } from "drizzle-orm";
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

import { runSummarization } from "./summarize";
import { runTagging } from "./tagging";

/**
 * What a job actually did, distinct from whether it threw. "skipped" covers
 * every early-return in runSummarization/runTagging — the feature disabled
 * (globally or per-user), no inference client configured, no content to
 * infer from, no prompt to send. Before this type existed, all of those
 * completed the job without throwing, and the queue runner's onComplete
 * marked the bookmark "success" regardless — indistinguishable from an
 * inference call that actually ran and produced a summary or tags. A
 * bookmark could carry `summarizationStatus: "success"` with `summary` still
 * null, and nothing surfaced the difference anywhere: not the API, not the
 * UI, not the CLI.
 */
export type InferenceOutcome = "done" | "skipped";

async function attemptMarkStatus(
  jobData: object | undefined,
  status: "success" | "failure" | "skipped",
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

export class OpenAiWorker {
  static async build() {
    logger.info("Starting inference worker ...");
    const worker = (await getQueueClient())!.createRunner<
      ZOpenAIRequest,
      InferenceOutcome
    >(
      OpenAIQueue,
      {
        run: withWorkerTracing(
          "inferenceWorker.run",
          withWorkerEventLog("inferenceWorker.run", runOpenAI),
        ),
        onComplete: async (job, outcome) => {
          workerStatsCounter.labels("inference", "completed").inc();
          const jobId = job.id;
          logger.info(
            `[inference][${jobId}] Completed successfully (${outcome})`,
          );
          await attemptMarkStatus(
            job.data,
            outcome === "skipped" ? "skipped" : "success",
          );
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
): Promise<InferenceOutcome> {
  const jobId = job.id;

  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.debug(
      `[inference][${jobId}] No inference client configured, nothing to do now`,
    );
    return "skipped";
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
      return await runTagging(bookmarkId, job, inferenceClient);
    default:
      throw new Error(`Unknown inference type: ${request.data.type}`);
  }
}
