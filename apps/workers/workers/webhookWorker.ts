import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import fetch from "node-fetch";

import { db } from "@karakeep/db";
import { bookmarks, webhooksTable } from "@karakeep/db/schema";
import {
  WebhookQueue,
  ZWebhookRequest,
  zWebhookRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

export class WebhookWorker {
  static async build() {
    logger.info("Starting webhook worker ...");
    const worker = (await getQueueClient())!.createRunner<ZWebhookRequest>(
      WebhookQueue,
      {
        run: runWebhook,
        onComplete: async (job) => {
          workerStatsCounter.labels("webhook", "completed").inc();
          const jobId = job.id;
          logger.info(`[webhook][${jobId}] Completed successfully`);
          return Promise.resolve();
        },
        onError: async (job) => {
          workerStatsCounter.labels("webhook", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[webhook][${jobId}] webhook job failed: ${job.error}\n${job.error.stack}`,
          );
          return Promise.resolve();
        },
      },
      {
        concurrency: serverConfig.webhook.numWorkers,
        pollIntervalMs: 1000,
        timeoutSecs:
          serverConfig.webhook.timeoutSec *
            (serverConfig.webhook.retryTimes + 1) +
          1, //consider retry times, and timeout and add 1 second for other stuff
        validator: zWebhookRequestSchema,
      },
    );

    return worker;
  }
}

async function fetchBookmark(bookmarkId: string) {
  return await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      link: {
        columns: {
          url: true,
        },
      },
    },
  });
}

async function fetchUserWebhooks(userId: string) {
  return await db.query.webhooksTable.findMany({
    where: eq(webhooksTable.userId, userId),
  });
}

async function runWebhook(job: DequeuedJob<ZWebhookRequest>) {
  const jobId = job.id;
  const webhookTimeoutSec = serverConfig.webhook.timeoutSec;

  const { bookmarkId } = job.data;
  const bookmark = await fetchBookmark(bookmarkId);

  const userId = job.data.userId ?? bookmark?.userId;
  if (!userId) {
    logger.error(
      `[webhook][${jobId}] Failed to find user for bookmark with id ${bookmarkId}. Skipping webhook`,
    );
    return;
  }

  const webhooks = await fetchUserWebhooks(userId);

  logger.info(
    `[webhook][${jobId}] Starting a webhook job for bookmark with id "${bookmarkId} for operation "${job.data.operation}"`,
  );

  await Promise.allSettled(
    webhooks
      .filter((w) => w.events.includes(job.data.operation))
      .map(async (webhook) => {
        const url = webhook.url;
        const webhookToken = webhook.token;
        const maxRetries = serverConfig.webhook.retryTimes;
        let attempt = 0;
        let success = false;

        while (attempt < maxRetries && !success) {
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(webhookToken
                  ? {
                      Authorization: `Bearer ${webhookToken}`,
                    }
                  : {}),
              },
              body: JSON.stringify({
                jobId,
                bookmarkId,
                userId,
                url: bookmark?.link ? bookmark.link.url : undefined,
                type: bookmark?.type,
                operation: job.data.operation,
              }),
              signal: AbortSignal.timeout(webhookTimeoutSec * 1000),
            });

            if (!response.ok) {
              logger.error(
                `Webhook call to ${url} failed with status: ${response.status}`,
              );
            } else {
              logger.info(
                `[webhook][${jobId}] Webhook to ${url} call succeeded`,
              );
              success = true;
            }
          } catch (error) {
            logger.error(
              `[webhook][${jobId}] Webhook to ${url} call failed: ${error}`,
            );
          }
          attempt++;
          if (!success && attempt < maxRetries) {
            logger.info(
              `[webhook][${jobId}] Retrying webhook call to ${url}, attempt ${attempt + 1}`,
            );
          }
        }
      }),
  );
}
