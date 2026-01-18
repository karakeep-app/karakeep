import "dotenv/config";

import { buildServer } from "server";

import {
  initTracing,
  loadAllPlugins,
  prepareQueue,
  shutdownTracing,
  startQueue,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { shutdownPromise } from "./exit";
import { AdminMaintenanceWorker } from "./workers/adminMaintenanceWorker";
import { AssetPreprocessingWorker } from "./workers/assetPreprocessingWorker";
import { BackupSchedulingWorker, BackupWorker } from "./workers/backupWorker";
import { CrawlerWorker } from "./workers/crawlerWorker";
import { FeedRefreshingWorker, FeedWorker } from "./workers/feedWorker";
import { OpenAiWorker } from "./workers/inference/inferenceWorker";
import { RuleEngineWorker } from "./workers/ruleEngineWorker";
import { SearchIndexingWorker } from "./workers/searchWorker";
import { VideoWorker } from "./workers/videoWorker";
import { WebhookWorker } from "./workers/webhookWorker";

const workerBuilders = {
  crawler: () => CrawlerWorker.build(),
  inference: () => OpenAiWorker.build(),
  search: () => SearchIndexingWorker.build(),
  adminMaintenance: () => AdminMaintenanceWorker.build(),
  video: () => VideoWorker.build(),
  feed: () => FeedWorker.build(),
  assetPreprocessing: () => AssetPreprocessingWorker.build(),
  webhook: () => WebhookWorker.build(),
  ruleEngine: () => RuleEngineWorker.build(),
  backup: () => BackupWorker.build(),
} as const;

type WorkerName = keyof typeof workerBuilders;
const enabledWorkers = new Set(serverConfig.workers.enabledWorkers);
const disabledWorkers = new Set(serverConfig.workers.disabledWorkers);

function isWorkerEnabled(name: WorkerName) {
  if (enabledWorkers.size > 0 && !enabledWorkers.has(name)) {
    return false;
  }
  if (disabledWorkers.has(name)) {
    return false;
  }
  return true;
}

async function main() {
  await loadAllPlugins();
  initTracing("workers");
  logger.info(`Workers version: ${serverConfig.serverVersion ?? "not set"}`);
  await prepareQueue();

  const httpServer = buildServer();

  const workers = await Promise.all(
    Object.entries(workerBuilders)
      .filter(([name]) => isWorkerEnabled(name as WorkerName))
      .map(async ([name, builder]) => ({
        name: name as WorkerName,
        worker: await builder(),
      })),
  );

  await startQueue();

  if (workers.some((w) => w.name === "feed")) {
    FeedRefreshingWorker.start();
  }

  if (workers.some((w) => w.name === "backup")) {
    BackupSchedulingWorker.start();
  }

  await Promise.any([
    Promise.all([
      ...workers.map(({ worker }) => worker.run()),
      httpServer.serve(),
    ]),
    shutdownPromise,
  ]);

  logger.info(
    `Shutting down ${workers.map((w) => w.name).join(", ")} workers ...`,
  );

  if (workers.some((w) => w.name === "feed")) {
    FeedRefreshingWorker.stop();
  }
  if (workers.some((w) => w.name === "backup")) {
    BackupSchedulingWorker.stop();
  }
  for (const { worker } of workers) {
    worker.stop();
  }
  await httpServer.stop();
  await shutdownTracing();
  process.exit(0);
}

main();
