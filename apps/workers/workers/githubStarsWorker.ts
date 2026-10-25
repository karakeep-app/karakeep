import { readStarredPage } from "./utils/githubStars";
import { and, eq, isNull, lt, lte, or } from "drizzle-orm";
import cron from "node-cron";
import { buildImpersonatingTRPCClient } from "trpc";
import { db } from "@karakeep/db";
import { githubStarsSubscriptions } from "@karakeep/db/schema";
import { GithubStarsQueue } from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import { getQueueClient } from "@karakeep/shared/queueing";
import { syncGithubStarsPage } from "@karakeep/trpc/models/githubStars.service";

export const GithubStarsSchedulingWorker = cron.schedule(
  "* * * * *",
  async () => {
    try {
      const due = db
        .select()
        .from(githubStarsSubscriptions)
        .where(
          and(
            eq(githubStarsSubscriptions.enabled, true),
            lte(githubStarsSubscriptions.nextRunAt, new Date()),
            or(
              isNull(githubStarsSubscriptions.leaseUntil),
              lt(githubStarsSubscriptions.leaseUntil, new Date()),
            ),
          ),
        )
        .all();
      for (const subscription of due) {
        await GithubStarsQueue.enqueue(
          { subscriptionId: subscription.id },
          {
            groupId: subscription.userId,
            idempotencyKey: subscription.id,
          },
        );
      }
    } catch (error) {
      logger.error(`[github-stars] Scheduling failed: ${error}`);
    }
  },
  { scheduled: false, runOnInit: false },
);

export class GithubStarsWorker {
  static async build() {
    return (await getQueueClient()).createRunner<
      { subscriptionId: string },
      void
    >(
      GithubStarsQueue,
      {
        run: async (job) =>
          syncGithubStarsPage(
            db,
            job.data.subscriptionId,
            readStarredPage,
            buildImpersonatingTRPCClient,
          ),
        onError: async () => {
          logger.error("[github-stars] Job failed; the scheduler will retry.");
        },
      },
      { concurrency: 1, pollIntervalMs: 1000, timeoutSecs: 600 },
    );
  }
}
