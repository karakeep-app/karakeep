import "dotenv/config";

import { buildServer } from "server";

import {
  AdminMaintenanceQueue,
  AssetPreprocessingQueue,
  BackupQueue,
  EmbeddingsQueue,
  FeedQueue,
  initEventLogger,
  initTracing,
  LinkCrawlerQueue,
  loadAllPlugins,
  LowPriorityCrawlerQueue,
  OpenAIQueue,
  prepareQueue,
  RuleEngineQueue,
  SearchIndexingQueue,
  shutdownEventLogger,
  shutdownTracing,
  startQueue,
  VideoWorkerQueue,
  WebhookQueue,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { shutdownPromise } from "./exit";

let backupSchedulingWorker:
  | typeof import("./workers/backupWorker").BackupSchedulingWorker
  | undefined;
let feedRefreshingWorker:
  | typeof import("./workers/feedWorker").FeedRefreshingWorker
  | undefined;

const workerBuilders = {
  crawler: async () => {
    const { CrawlerWorker } = await import("./workers/crawlerWorker");
    await LinkCrawlerQueue.ensureInit();
    return CrawlerWorker.build(LinkCrawlerQueue);
  },
  lowPriorityCrawler: async () => {
    const { CrawlerWorker } = await import("./workers/crawlerWorker");
    await LowPriorityCrawlerQueue.ensureInit();
    return CrawlerWorker.build(LowPriorityCrawlerQueue);
  },
  embeddings: async () => {
    const { EmbeddingsWorker } = await import("./workers/embeddingsWorker");
    await EmbeddingsQueue.ensureInit();
    return EmbeddingsWorker.build();
  },
  inference: async () => {
    const { OpenAiWorker } =
      await import("./workers/inference/inferenceWorker");
    await OpenAIQueue.ensureInit();
    return OpenAiWorker.build();
  },
  search: async () => {
    const { SearchIndexingWorker } = await import("./workers/searchWorker");
    await SearchIndexingQueue.ensureInit();
    return SearchIndexingWorker.build();
  },
  adminMaintenance: async () => {
    const { AdminMaintenanceWorker } =
      await import("./workers/adminMaintenanceWorker");
    await AdminMaintenanceQueue.ensureInit();
    return AdminMaintenanceWorker.build();
  },
  video: async () => {
    const { VideoWorker } = await import("./workers/videoWorker");
    await VideoWorkerQueue.ensureInit();
    return VideoWorker.build();
  },
  feed: async () => {
    const { FeedRefreshingWorker, FeedWorker } =
      await import("./workers/feedWorker");
    feedRefreshingWorker = FeedRefreshingWorker;
    await FeedQueue.ensureInit();
    return FeedWorker.build();
  },
  assetPreprocessing: async () => {
    const { AssetPreprocessingWorker } =
      await import("./workers/assetPreprocessingWorker");
    await AssetPreprocessingQueue.ensureInit();
    return AssetPreprocessingWorker.build();
  },
  webhook: async () => {
    const { WebhookWorker } = await import("./workers/webhookWorker");
    await WebhookQueue.ensureInit();
    return WebhookWorker.build();
  },
  ruleEngine: async () => {
    const { RuleEngineWorker } = await import("./workers/ruleEngineWorker");
    await RuleEngineQueue.ensureInit();
    return RuleEngineWorker.build();
  },
  backup: async () => {
    const { BackupSchedulingWorker, BackupWorker } =
      await import("./workers/backupWorker");
    backupSchedulingWorker = BackupSchedulingWorker;
    await BackupQueue.ensureInit();
    return BackupWorker.build();
  },
} as const;

async function buildImportWorker() {
  const { ImportWorker } = await import("./workers/importWorker");
  return new ImportWorker();
}

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
  initEventLogger("workers");
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
    feedRefreshingWorker?.start();
  }

  if (workers.some((w) => w.name === "backup")) {
    backupSchedulingWorker?.start();
  }

  // Start import polling worker
  let importWorker = null;
  let importWorkerPromise: Promise<void> | null = null;
  if (isWorkerEnabled("import")) {
    importWorker = await buildImportWorker();
    importWorkerPromise = importWorker.start();
  }

  let exitCode = 0;
  await Promise.race([
    Promise.all([
      ...workers.map(({ worker }) => worker.run()),
      httpServer.serve(),
      ...(importWorkerPromise ? [importWorkerPromise] : []),
    ]).catch((err: unknown) => {
      exitCode = 1;
      logger.error(`One of the workers failed, shutting down: ${err}`);
    }),
    shutdownPromise,
  ]);

  logger.info(
    `Shutting down ${workers.map((w) => w.name).join(", ")} workers ...`,
  );

  if (workers.some((w) => w.name === "feed")) {
    feedRefreshingWorker?.stop();
  }
  if (workers.some((w) => w.name === "backup")) {
    backupSchedulingWorker?.stop();
  }
  if (importWorker) {
    importWorker.stop();
  }
  for (const { worker } of workers) {
    worker.stop();
  }
  await httpServer.stop();
  await shutdownEventLogger();
  await shutdownTracing();
  process.exit(exitCode);
}

main();
