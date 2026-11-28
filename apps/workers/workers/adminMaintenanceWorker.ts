import { expireHistory } from "./adminMaintenance/tasks/expireBookmarkHistory";
import cron from "node-cron";
import {
  AdminMaintenanceQueue,
  ZAdminMaintenanceMigrateLargeLinkHtmlTask,
  ZAdminMaintenanceTask,
  zAdminMaintenanceTaskSchema,
  ZAdminMaintenanceTidyAssetsTask,
} from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

import { workerStatsCounter } from "../metrics";
import { withWorkerTracing } from "../workerTracing";
import { runMigrateLargeLinkHtmlTask } from "./adminMaintenance/tasks/migrateLinkHtmlContent";
import { runPurgeBookmarksOverQuotaTask } from "./adminMaintenance/tasks/purgeBookmarksOverQuota";
import { runTidyAssetsTask } from "./adminMaintenance/tasks/tidyAssets";

export class AdminMaintenanceWorker {
  static async build() {
    logger.info("Starting admin maintenance worker ...");
    const worker =
      (await getQueueClient())!.createRunner<ZAdminMaintenanceTask>(
        AdminMaintenanceQueue,
        {
          run: withWorkerTracing(
            "adminMaintenanceWorker.run",
            runAdminMaintenance,
          ),
          onComplete: (job) => {
            workerStatsCounter
              .labels(`adminMaintenance:${job.data.type}`, "completed")
              .inc();
            logger.info(
              `[adminMaintenance:${job.data.type}][${job.id}] Completed successfully`,
            );
            return Promise.resolve();
          },
          onError: (job) => {
            workerStatsCounter
              .labels(`adminMaintenance:${job.data?.type}`, "failed")
              .inc();
            if (job.numRetriesLeft == 0) {
              workerStatsCounter
                .labels(
                  `adminMaintenance:${job.data?.type}`,
                  "failed_permanent",
                )
                .inc();
            }
            logger.error(
              `[adminMaintenance:${job.data?.type}][${job.id}] Job failed: ${job.error}\n${job.error.stack}`,
            );
            return Promise.resolve();
          },
        },
        {
          concurrency: 1,
          pollIntervalMs: 1000,
          timeoutSecs: 600,
        },
      );

    // Use the existing queue for retries and metrics. Startup catches up after
    // downtime; the daily UTC schedule keeps cleanup tied to this worker's lifecycle.
    const cleanup = () =>
      AdminMaintenanceQueue.enqueue({ type: "expire_bookmark_history" }).catch(
        (error) => logger.error(`History cleanup failed: ${error}`),
      );
    const schedule = cron.schedule("0 3 * * *", cleanup, {
      scheduled: false,
      timezone: "UTC",
    });
    return {
      run: async () => {
        schedule.start();
        void cleanup();
        return worker.run();
      },
      stop: async () => {
        schedule.stop();
        return worker.stop();
      },
    };
  }
}

async function runAdminMaintenance(job: DequeuedJob<ZAdminMaintenanceTask>) {
  const jobId = job.id;
  const parsed = zAdminMaintenanceTaskSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new Error(
      `[adminMaintenance][${jobId}] Got malformed job request: ${parsed.error.toString()}`,
    );
  }

  const task = parsed.data;

  switch (task.type) {
    case "expire_bookmark_history":
      return expireHistory();
    case "tidy_assets":
      return runTidyAssetsTask(
        job as DequeuedJob<ZAdminMaintenanceTidyAssetsTask>,
        task,
      );
    case "migrate_large_link_html":
      return runMigrateLargeLinkHtmlTask(
        job as DequeuedJob<ZAdminMaintenanceMigrateLargeLinkHtmlTask>,
      );
    case "purge_bookmarks_over_quota":
      return runPurgeBookmarksOverQuotaTask(job, task);
    default: {
      const exhaustiveCheck: never = task;
      throw new Error(
        `[adminMaintenance][${jobId}] No handler registered for task ${(exhaustiveCheck as ZAdminMaintenanceTask).type}`,
      );
    }
  }
}
