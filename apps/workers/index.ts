import "dotenv/config";

import { AssetPreprocessingWorker } from "assetPreprocessingWorker";
import { FeedRefreshingWorker, FeedWorker } from "feedWorker";
import { RuleEngineWorker } from "ruleEngineWorker";
import { TidyAssetsWorker } from "tidyAssetsWorker";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { runQueueDBMigrations } from "@karakeep/shared/queues";

import { CrawlerWorker } from "./crawlerWorker";
import { shutdownPromise } from "./exit";
import { OpenAiWorker } from "./openaiWorker";
import { SearchIndexingWorker } from "./searchWorker";
import { VideoWorker } from "./videoWorker";
import { WarcerWorker } from "./warcerWorker";
import { WebhookWorker } from "./webhookWorker";

async function main() {
  logger.info(`Workers version: ${serverConfig.serverVersion ?? "not set"}`);
  runQueueDBMigrations();

  const [
    crawler,
    openai,
    search,
    tidyAssets,
    video,
    feed,
    assetPreprocessing,
    webhook,
    ruleEngine,
    warcer,
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
    WarcerWorker.build(),
  ];
  FeedRefreshingWorker.start();

  await Promise.any([
    Promise.all([
      crawler.run(),
      openai.run(),
      search.run(),
      tidyAssets.run(),
      video.run(),
      feed.run(),
      assetPreprocessing.run(),
      webhook.run(),
      ruleEngine.run(),
      warcer.run(),
    ]),
    shutdownPromise,
  ]);
  logger.info(
    "Shutting down crawler, openai, tidyAssets, video, feed, assetPreprocessing, webhook, ruleEngine, warcer and search workers ...",
  );

  FeedRefreshingWorker.stop();
  crawler.stop();
  openai.stop();
  search.stop();
  tidyAssets.stop();
  video.stop();
  feed.stop();
  assetPreprocessing.stop();
  webhook.stop();
  ruleEngine.stop();
  warcer.stop();
}

main();
