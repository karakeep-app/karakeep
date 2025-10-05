import { z } from "zod";

import { EnqueueOptions, getQueueClient } from "@karakeep/shared/queueing";
import { zRuleEngineEventSchema } from "@karakeep/shared/types/rules";

import { loadAllPlugins } from ".";

await loadAllPlugins();
const QUEUE_CLIENT = await getQueueClient();

export async function prepareQueue() {
  await QUEUE_CLIENT.prepare();
}

export async function startQueue() {
  await QUEUE_CLIENT.start();
}

// Link Crawler
export const zCrawlLinkRequestSchema = z.object({
  bookmarkId: z.string(),
  runInference: z.boolean().optional(),
  archiveFullPage: z.boolean().optional().default(false),
});
export type ZCrawlLinkRequest = z.input<typeof zCrawlLinkRequestSchema>;

export const LinkCrawlerQueue = QUEUE_CLIENT.createQueue<ZCrawlLinkRequest>(
  "link_crawler_queue",
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

export const OpenAIQueue = QUEUE_CLIENT.createQueue<ZOpenAIRequest>(
  "openai_queue",
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
export const SearchIndexingQueue =
  QUEUE_CLIENT.createQueue<ZSearchIndexingRequest>("searching_indexing", {
    defaultJobArgs: {
      numRetries: 5,
    },
    keepFailedJobs: false,
  });

// Tidy Assets Worker
export const zTidyAssetsRequestSchema = z.object({
  cleanDanglingAssets: z.boolean().optional().default(false),
  syncAssetMetadata: z.boolean().optional().default(false),
});
export type ZTidyAssetsRequest = z.infer<typeof zTidyAssetsRequestSchema>;
export const TidyAssetsQueue = QUEUE_CLIENT.createQueue<ZTidyAssetsRequest>(
  "tidy_assets_queue",
  {
    defaultJobArgs: {
      numRetries: 1,
    },
    keepFailedJobs: false,
  },
);

export async function triggerSearchReindex(
  bookmarkId: string,
  opts?: Omit<EnqueueOptions, "idempotencyKey">,
) {
  await SearchIndexingQueue.enqueue(
    {
      bookmarkId,
      type: "index",
    },
    {
      ...opts,
      // BUG: restate idempotency is also against completed jobs. Disabling it for now
      //idempotencyKey: `index:${bookmarkId}`,
    },
  );
}

export const zvideoRequestSchema = z.object({
  bookmarkId: z.string(),
  url: z.string(),
});
export type ZVideoRequest = z.infer<typeof zvideoRequestSchema>;

export const VideoWorkerQueue = QUEUE_CLIENT.createQueue<ZVideoRequest>(
  "video_queue",
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

export const FeedQueue = QUEUE_CLIENT.createQueue<ZFeedRequestSchema>(
  "feed_queue",
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
  QUEUE_CLIENT.createQueue<AssetPreprocessingRequest>(
    "asset_preprocessing_queue",
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
export const WebhookQueue = QUEUE_CLIENT.createQueue<ZWebhookRequest>(
  "webhook_queue",
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
export const RuleEngineQueue = QUEUE_CLIENT.createQueue<ZRuleEngineRequest>(
  "rule_engine_queue",
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
