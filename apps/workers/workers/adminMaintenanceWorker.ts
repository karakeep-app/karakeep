import { workerStatsCounter } from "metrics";

import {
  AdminMaintenanceQueue,
  ZAdminMaintenanceTask,
  zAdminMaintenanceTaskSchema,
  ZAdminMaintenanceTidyAssetsTask,
} from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

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
            logger.error(
              `[adminMaintenance:${job.data?.type}][${job.id}] Job failed: ${job.error}\n${job.error.stack}`,
            );
            return Promise.resolve();
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
    default:
      throw new Error(
        `[adminMaintenance][${jobId}] No handler registered for task ${task.type}`,
      );
  }
}
