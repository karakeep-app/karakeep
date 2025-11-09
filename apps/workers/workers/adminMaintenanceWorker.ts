import { workerStatsCounter } from "metrics";

import {
  AdminMaintenanceQueue,
  ZAdminMaintenanceMigrateLargeLinkHtmlTask,
  ZAdminMaintenanceTask,
  zAdminMaintenanceTaskSchema,
  ZAdminMaintenanceTidyAssetsTask,
} from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

import { runMigrateLargeLinkHtmlTask } from "./adminMaintenance/tasks/migrateLinkHtmlContent";
import { runTidyAssetsTask } from "./adminMaintenance/tasks/tidyAssets";

export class AdminMaintenanceWorker {
  static async build() {
    logger.info("Starting admin maintenance worker ...");
    const worker =
      (await getQueueClient())!.createRunner<ZAdminMaintenanceTask>(
        AdminMaintenanceQueue,
        {
          run: runAdminMaintenance,
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

    return worker;
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
    case "tidy_assets":
      return runTidyAssetsTask(
        job as DequeuedJob<ZAdminMaintenanceTidyAssetsTask>,
        task,
      );
    case "migrate_large_link_html":
      return runMigrateLargeLinkHtmlTask(
        job as DequeuedJob<ZAdminMaintenanceMigrateLargeLinkHtmlTask>,
      );
    default: {
      const exhaustiveCheck: never = task;
      throw new Error(
        `[adminMaintenance][${jobId}] No handler registered for task ${(exhaustiveCheck as ZAdminMaintenanceTask).type}`,
      );
    }
  }
}
