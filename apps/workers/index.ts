import "dotenv/config";

import { buildServer } from "server";

import { loadAllPlugins } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { runQueueDBMigrations } from "@karakeep/shared/queues";

import { shutdownPromise } from "./exit";
import { AssetPreprocessingWorker } from "./workers/assetPreprocessingWorker";
import { CrawlerWorker } from "./workers/crawlerWorker";
import { FeedRefreshingWorker, FeedWorker } from "./workers/feedWorker";
import { OpenAiWorker } from "./workers/inference/inferenceWorker";
import { RuleEngineWorker } from "./workers/ruleEngineWorker";
import { SearchIndexingWorker } from "./workers/searchWorker";
import { TidyAssetsWorker } from "./workers/tidyAssetsWorker";
import { VideoWorker } from "./workers/videoWorker";
import { WebhookWorker } from "./workers/webhookWorker";

async function main() {
  await loadAllPlugins();
  logger.info(`Workers version: ${serverConfig.serverVersion ?? "not set"}`);
  runQueueDBMigrations();

  const [
    crawler,
    inference,
    search,
    tidyAssets,
    video,
    feed,
    assetPreprocessing,
    webhook,
    ruleEngine,
    httpServer,
  ] = [
    await CrawlerWorker.build(),
    OpenAiWorker.build(),
    SearchIndexingWorker.build(),
    TidyAssetsWorker.build(),
    VideoWorker.build(),
    FeedWorker.build(),
    AssetPreprocessingWorker.build(),
    WebhookWorker.build(),
    RuleEngineWorker.build(),
    buildServer(),
  ];
  FeedRefreshingWorker.start();

  await Promise.any([
    Promise.all([
      crawler.run(),
      inference.run(),
      search.run(),
      tidyAssets.run(),
      video.run(),
      feed.run(),
      assetPreprocessing.run(),
      webhook.run(),
      ruleEngine.run(),
      httpServer.serve(),
    ]),
    shutdownPromise,
  ]);
  logger.info(
    "Shutting down crawler, inference, tidyAssets, video, feed, assetPreprocessing, webhook, ruleEngine and search workers ...",
  );

  FeedRefreshingWorker.stop();
  crawler.stop();
  inference.stop();
  search.stop();
  tidyAssets.stop();
  video.stop();
  feed.stop();
  assetPreprocessing.stop();
  webhook.stop();
  ruleEngine.stop();
  await httpServer.stop();
  process.exit(0);
}

main();
