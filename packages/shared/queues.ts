import path from "node:path";
import { buildDBClient, EnqueueOptions, migrateDB, SqliteQueue } from "liteque";
import { z } from "zod";

import serverConfig from "./config";
import { zRuleEngineEventSchema } from "./types/rules";

const QUEUE_DB_PATH = path.join(serverConfig.dataDir, "queue.db");

const queueDB = buildDBClient(QUEUE_DB_PATH);

export function runQueueDBMigrations() {
  migrateDB(queueDB);
}

// Link Crawler
export const zCrawlLinkRequestSchema = z.object({
  bookmarkId: z.string(),
  runInference: z.boolean().optional(),
  archiveFullPage: z.boolean().optional().default(false),
});
export type ZCrawlLinkRequest = z.input<typeof zCrawlLinkRequestSchema>;

export const LinkCrawlerQueue = new SqliteQueue<ZCrawlLinkRequest>(
  "link_crawler_queue",
  queueDB,
  {
    defaultJobArgs: {
      numRetries: 5,
    },
    keepFailedJobs: false,
  },
);

// Inference Worker
export const zOpenAIRequestSchema = z.object({
  bookmarkId: z.string(),
  type: z.enum(["summarize", "tag"]).default("tag"),
});
export type ZOpenAIRequest = z.infer<typeof zOpenAIRequestSchema>;

export const OpenAIQueue = new SqliteQueue<ZOpenAIRequest>(
  "openai_queue",
  queueDB,
  {
    defaultJobArgs: {
      numRetries: 3,
    },
    keepFailedJobs: false,
  },
);

// Search Indexing Worker
export const zSearchIndexingRequestSchema = z.object({
  bookmarkId: z.string(),
  type: z.enum(["index", "delete"]),
});
export type ZSearchIndexingRequest = z.infer<
  typeof zSearchIndexingRequestSchema
>;
export const SearchIndexingQueue = new SqliteQueue<ZSearchIndexingRequest>(
  "searching_indexing",
  queueDB,
  {
    defaultJobArgs: {
      numRetries: 5,
    },
    keepFailedJobs: false,
  },
);

// Tidy Assets Worker
export const zTidyAssetsRequestSchema = z.object({
  cleanDanglingAssets: z.boolean().optional().default(false),
  syncAssetMetadata: z.boolean().optional().default(false),
});
export type ZTidyAssetsRequest = z.infer<typeof zTidyAssetsRequestSchema>;
export const TidyAssetsQueue = new SqliteQueue<ZTidyAssetsRequest>(
  "tidy_assets_queue",
  queueDB,
  {
    defaultJobArgs: {
      numRetries: 1,
    },
    keepFailedJobs: false,
  },
);

export async function triggerSearchReindex(
  bookmarkId: string,
  opts?: EnqueueOptions,
) {
  await SearchIndexingQueue.enqueue(
    {
      bookmarkId,
      type: "index",
    },
    opts,
  );
}

export const zvideoRequestSchema = z.object({
  bookmarkId: z.string(),
  url: z.string(),
});
export type ZVideoRequest = z.infer<typeof zvideoRequestSchema>;

export const VideoWorkerQueue = new SqliteQueue<ZVideoRequest>(
  "video_queue",
  queueDB,
  {
    defaultJobArgs: {
      numRetries: 5,
    },
    keepFailedJobs: false,
  },
);

// Feed Worker
export const zFeedRequestSchema = z.object({
  feedId: z.string(),
});
export type ZFeedRequestSchema = z.infer<typeof zFeedRequestSchema>;

export const FeedQueue = new SqliteQueue<ZFeedRequestSchema>(
  "feed_queue",
  queueDB,
  {
    defaultJobArgs: {
      // One retry is enough for the feed queue given that it's periodic
      numRetries: 1,
    },
    keepFailedJobs: false,
  },
);

// Preprocess Assets
export const zAssetPreprocessingRequestSchema = z.object({
  bookmarkId: z.string(),
  fixMode: z.boolean().optional().default(false),
});
export type AssetPreprocessingRequest = z.infer<
  typeof zAssetPreprocessingRequestSchema
>;
export const AssetPreprocessingQueue =
  new SqliteQueue<AssetPreprocessingRequest>(
    "asset_preprocessing_queue",
    queueDB,
    {
      defaultJobArgs: {
        numRetries: 2,
      },
      keepFailedJobs: false,
    },
  );

// Webhook worker
export const zWebhookRequestSchema = z.object({
  bookmarkId: z.string(),
  operation: z.enum(["crawled", "created", "edited", "ai tagged", "deleted"]),
  userId: z.string().optional(),
});
export type ZWebhookRequest = z.infer<typeof zWebhookRequestSchema>;
export const WebhookQueue = new SqliteQueue<ZWebhookRequest>(
  "webhook_queue",
  queueDB,
  {
    defaultJobArgs: {
      numRetries: 3,
    },
    keepFailedJobs: false,
  },
);

export async function triggerWebhook(
  bookmarkId: string,
  operation: ZWebhookRequest["operation"],
  userId?: string,
  opts?: EnqueueOptions,
) {
  await WebhookQueue.enqueue(
    {
      bookmarkId,
      userId,
      operation,
    },
    opts,
  );
}

// RuleEngine worker
export const zRuleEngineRequestSchema = z.object({
  bookmarkId: z.string(),
  events: z.array(zRuleEngineEventSchema),
});
export type ZRuleEngineRequest = z.infer<typeof zRuleEngineRequestSchema>;
export const RuleEngineQueue = new SqliteQueue<ZRuleEngineRequest>(
  "rule_engine_queue",
  queueDB,
  {
    defaultJobArgs: {
      numRetries: 1,
    },
    keepFailedJobs: false,
  },
);

export async function triggerRuleEngineOnEvent(
  bookmarkId: string,
  events: z.infer<typeof zRuleEngineEventSchema>[],
  opts?: EnqueueOptions,
) {
  await RuleEngineQueue.enqueue(
    {
      events,
      bookmarkId,
    },
    opts,
  );
}
