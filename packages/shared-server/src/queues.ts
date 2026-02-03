import { z } from "zod";

import {
  EnqueueOptions,
  getQueueClient,
  Queue,
  QueueClient,
  QueueOptions,
} from "@karakeep/shared/queueing";
import { zRuleEngineEventSchema } from "@karakeep/shared/types/rules";

import { loadAllPlugins } from ".";

// Lazy client initialization - plugins are loaded on first access
// We cache the promise to ensure only one initialization happens even with concurrent calls
let clientPromise: Promise<QueueClient> | null = null;

function getClient(): Promise<QueueClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      await loadAllPlugins();
      return await getQueueClient();
    })();
  }
  return clientPromise;
}

/**
 * Creates a deferred queue that initializes lazily on first use.
 * This allows the module to be imported without requiring plugins to be loaded.
 */
function createDeferredQueue<T>(name: string, options: QueueOptions): Queue<T> {
  // Cache the promise to ensure only one queue is created even with concurrent calls
  let queuePromise: Promise<Queue<T>> | null = null;

  const ensureQueue = (): Promise<Queue<T>> => {
    if (!queuePromise) {
      queuePromise = (async () => {
        const client = await getClient();
        return client.createQueue<T>(name, options);
      })();
    }
    return queuePromise;
  };

  return {
    opts: options,
    name: () => name,
    ensureInit: async () => {
      await ensureQueue();
    },
    async enqueue(payload: T, opts?: EnqueueOptions) {
      return (await ensureQueue()).enqueue(payload, opts);
    },
    async stats() {
      return (await ensureQueue()).stats();
    },
    async cancelAllNonRunning() {
      const q = await ensureQueue();
      return q.cancelAllNonRunning?.() ?? 0;
    },
  };
}

export async function prepareQueue() {
  const client = await getClient();
  await client.prepare();
}

export async function startQueue() {
  const client = await getClient();
  await client.start();
}

// Link Crawler
export const zCrawlLinkRequestSchema = z.object({
  bookmarkId: z.string(),
  runInference: z.boolean().optional(),
  archiveFullPage: z.boolean().optional().default(false),
  storePdf: z.boolean().optional().default(false),
});
export type ZCrawlLinkRequest = z.input<typeof zCrawlLinkRequestSchema>;

export const LinkCrawlerQueue = createDeferredQueue<ZCrawlLinkRequest>(
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

export const OpenAIQueue = createDeferredQueue<ZOpenAIRequest>("openai_queue", {
  defaultJobArgs: {
    numRetries: 3,
  },
  keepFailedJobs: false,
});

// Search Indexing Worker
export const zSearchIndexingRequestSchema = z.object({
  bookmarkId: z.string(),
  type: z.enum(["index", "delete"]),
});
export type ZSearchIndexingRequest = z.infer<
  typeof zSearchIndexingRequestSchema
>;
export const SearchIndexingQueue = createDeferredQueue<ZSearchIndexingRequest>(
  "searching_indexing",
  {
    defaultJobArgs: {
      numRetries: 5,
    },
    keepFailedJobs: false,
  },
);

// Admin maintenance worker
export const zTidyAssetsRequestSchema = z.object({
  cleanDanglingAssets: z.boolean().optional().default(false),
  syncAssetMetadata: z.boolean().optional().default(false),
});
export type ZTidyAssetsRequest = z.infer<typeof zTidyAssetsRequestSchema>;

export const zAdminMaintenanceTaskSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tidy_assets"),
    args: zTidyAssetsRequestSchema,
  }),
  z.object({
    type: z.literal("migrate_large_link_html"),
  }),
]);

export type ZAdminMaintenanceTask = z.infer<typeof zAdminMaintenanceTaskSchema>;
export type ZAdminMaintenanceTaskType = ZAdminMaintenanceTask["type"];
export type ZAdminMaintenanceTidyAssetsTask = Extract<
  ZAdminMaintenanceTask,
  { type: "tidy_assets" }
>;
export type ZAdminMaintenanceMigrateLargeLinkHtmlTask = Extract<
  ZAdminMaintenanceTask,
  { type: "migrate_large_link_html" }
>;

export const AdminMaintenanceQueue = createDeferredQueue<ZAdminMaintenanceTask>(
  "admin_maintenance_queue",
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
      idempotencyKey: `index:${bookmarkId}`,
    },
  );
}

export const zvideoRequestSchema = z.object({
  bookmarkId: z.string(),
  url: z.string(),
});
export type ZVideoRequest = z.infer<typeof zvideoRequestSchema>;

export const VideoWorkerQueue = createDeferredQueue<ZVideoRequest>(
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

export const FeedQueue = createDeferredQueue<ZFeedRequestSchema>("feed_queue", {
  defaultJobArgs: {
    // One retry is enough for the feed queue given that it's periodic
    numRetries: 1,
  },
  keepFailedJobs: false,
});

// Preprocess Assets
export const zAssetPreprocessingRequestSchema = z.object({
  bookmarkId: z.string(),
  fixMode: z.boolean().optional().default(false),
});
export type AssetPreprocessingRequest = z.infer<
  typeof zAssetPreprocessingRequestSchema
>;
export const AssetPreprocessingQueue =
  createDeferredQueue<AssetPreprocessingRequest>("asset_preprocessing_queue", {
    defaultJobArgs: {
      numRetries: 2,
    },
    keepFailedJobs: false,
  });

// Webhook worker
export const zWebhookRequestSchema = z.object({
  bookmarkId: z.string(),
  operation: z.enum(["crawled", "created", "edited", "ai tagged", "deleted"]),
  userId: z.string().optional(),
});
export type ZWebhookRequest = z.infer<typeof zWebhookRequestSchema>;
export const WebhookQueue = createDeferredQueue<ZWebhookRequest>(
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
export const RuleEngineQueue = createDeferredQueue<ZRuleEngineRequest>(
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

// Backup worker
export const zBackupRequestSchema = z.object({
  userId: z.string(),
  backupId: z.string().optional(),
});
export type ZBackupRequest = z.infer<typeof zBackupRequestSchema>;
export const BackupQueue = createDeferredQueue<ZBackupRequest>("backup_queue", {
  defaultJobArgs: {
    numRetries: 2,
  },
  keepFailedJobs: false,
});
