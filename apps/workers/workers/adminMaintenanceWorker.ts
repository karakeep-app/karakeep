import { workerStatsCounter } from "metrics";

import {
  AdminMaintenanceQueue,
  ZAdminMaintenanceTask,
  zAdminMaintenanceTaskSchema,
  ZAdminMaintenanceTidyAssetsTask,
} from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import {
  DequeuedJob,
  DequeuedJobError,
  getQueueClient,
} from "@karakeep/shared/queueing";

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
            const taskLabel = getTaskLabel(job);
            workerStatsCounter.labels("adminMaintenance", "completed").inc();
            logger.info(
              `[adminMaintenance${taskLabel}][${job.id}] Completed successfully`,
            );
            return Promise.resolve();
          },
          onError: (job) => {
            const taskLabel = getTaskLabel(job);
            workerStatsCounter.labels("adminMaintenance", "failed").inc();
            logger.error(
              `[adminMaintenance${taskLabel}][${job.id}] Job failed: ${job.error}\n${job.error.stack}`,
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

function getTaskLabel(
  job:
    | DequeuedJob<ZAdminMaintenanceTask>
    | DequeuedJobError<ZAdminMaintenanceTask>,
) {
  const parsed = zAdminMaintenanceTaskSchema.safeParse(job.data);
  if (!parsed.success) {
    return "";
  }

  return `:${parsed.data.type}`;
}
