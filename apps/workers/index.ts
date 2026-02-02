import "dotenv/config";

import { buildServer } from "server";

import {
  AdminMaintenanceQueue,
  AssetPreprocessingQueue,
  BackupQueue,
  FeedQueue,
  ImportLinkCrawlerQueue,
  initTracing,
  LinkCrawlerQueue,
  loadAllPlugins,
  OpenAIQueue,
  prepareQueue,
  RuleEngineQueue,
  SearchIndexingQueue,
  shutdownTracing,
  startQueue,
  VideoWorkerQueue,
  WebhookQueue,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { shutdownPromise } from "./exit";
import { AdminMaintenanceWorker } from "./workers/adminMaintenanceWorker";
import { AssetPreprocessingWorker } from "./workers/assetPreprocessingWorker";
import { BackupSchedulingWorker, BackupWorker } from "./workers/backupWorker";
import { CrawlerWorker } from "./workers/crawlerWorker";
import { FeedRefreshingWorker, FeedWorker } from "./workers/feedWorker";
import { ImportWorker } from "./workers/importWorker";
import { OpenAiWorker } from "./workers/inference/inferenceWorker";
import { RuleEngineWorker } from "./workers/ruleEngineWorker";
import { SearchIndexingWorker } from "./workers/searchWorker";
import { VideoWorker } from "./workers/videoWorker";
import { WebhookWorker } from "./workers/webhookWorker";

const workerBuilders = {
  crawler: async () => {
    await LinkCrawlerQueue.ensureInit();
    await ImportLinkCrawlerQueue.ensureInit();
    return CrawlerWorker.build();
  },
  inference: async () => {
    await OpenAIQueue.ensureInit();
    return OpenAiWorker.build();
  },
  search: async () => {
    await SearchIndexingQueue.ensureInit();
    return SearchIndexingWorker.build();
  },
  adminMaintenance: async () => {
    await AdminMaintenanceQueue.ensureInit();
    return AdminMaintenanceWorker.build();
  },
  video: async () => {
    await VideoWorkerQueue.ensureInit();
    return VideoWorker.build();
  },
  feed: async () => {
    await FeedQueue.ensureInit();
    return FeedWorker.build();
  },
  assetPreprocessing: async () => {
    await AssetPreprocessingQueue.ensureInit();
    return AssetPreprocessingWorker.build();
  },
  webhook: async () => {
    await WebhookQueue.ensureInit();
    return WebhookWorker.build();
  },
  ruleEngine: async () => {
    await RuleEngineQueue.ensureInit();
    return RuleEngineWorker.build();
  },
  backup: async () => {
    await BackupQueue.ensureInit();
    return BackupWorker.build();
  },
} as const;

type WorkerName = keyof typeof workerBuilders | "import";
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

  // Start import polling worker
  let importWorker: ImportWorker | null = null;
  let importWorkerPromise: Promise<void> | null = null;
  if (isWorkerEnabled("import")) {
    importWorker = new ImportWorker();
    importWorkerPromise = importWorker.start();
  }

  await Promise.any([
    Promise.all([
      ...workers.map(({ worker }) => worker.run()),
      httpServer.serve(),
      ...(importWorkerPromise ? [importWorkerPromise] : []),
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
  if (importWorker) {
    importWorker.stop();
  }
  for (const { worker } of workers) {
    worker.stop();
  }
  await httpServer.stop();
  await shutdownTracing();
  process.exit(0);
}

main();
