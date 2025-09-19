import { count, sum } from "drizzle-orm";
import { Counter, Gauge, Histogram, register } from "prom-client";

import { db } from "@karakeep/db";
import { assets, bookmarks, users } from "@karakeep/db/schema";
import {
  AssetPreprocessingQueue,
  FeedQueue,
  LinkCrawlerQueue,
  OpenAIQueue,
  RuleEngineQueue,
  SearchIndexingQueue,
  TidyAssetsQueue,
  VideoWorkerQueue,
  WebhookQueue,
} from "@karakeep/shared-server";

// Queue metrics
const queuePendingJobsGauge = new Gauge({
  name: "karakeep_queue_jobs",
  help: "Number of jobs in each background queue",
  labelNames: ["queue_name", "status"],
  async collect() {
    const queues = [
      { name: "link_crawler", queue: LinkCrawlerQueue },
      { name: "openai", queue: OpenAIQueue },
      { name: "search_indexing", queue: SearchIndexingQueue },
      { name: "tidy_assets", queue: TidyAssetsQueue },
      { name: "video_worker", queue: VideoWorkerQueue },
      { name: "feed", queue: FeedQueue },
      { name: "asset_preprocessing", queue: AssetPreprocessingQueue },
      { name: "webhook", queue: WebhookQueue },
      { name: "rule_engine", queue: RuleEngineQueue },
    ];

    const stats = await Promise.all(
      queues.map(async ({ name, queue }) => {
        try {
          return {
            ...(await queue.stats()),
            name,
          };
        } catch (error) {
          console.error(`Failed to get stats for queue ${name}:`, error);
          return { name, pending: 0, pending_retry: 0, failed: 0, running: 0 };
        }
      }),
    );

    stats.forEach(({ name, pending, pending_retry, failed, running }) => {
      this.set({ queue_name: name, status: "pending" }, pending);
      this.set({ queue_name: name, status: "pending_retry" }, pending_retry);
      this.set({ queue_name: name, status: "failed" }, failed);
      this.set({ queue_name: name, status: "running" }, running);
    });
  },
});

// User metrics
const totalUsersGauge = new Gauge({
  name: "karakeep_total_users",
  help: "Total number of users in the system",
  async collect() {
    try {
      const result = await db.select({ count: count() }).from(users);
      this.set(result[0]?.count ?? 0);
    } catch (error) {
      console.error("Failed to get user count:", error);
      this.set(0);
    }
  },
});

// Asset metrics
const totalAssetSizeGauge = new Gauge({
  name: "karakeep_total_asset_size_bytes",
  help: "Total size of all assets in bytes",
  async collect() {
    try {
      const result = await db
        .select({ totalSize: sum(assets.size) })
        .from(assets);
      this.set(Number(result[0]?.totalSize ?? 0));
    } catch (error) {
      console.error("Failed to get total asset size:", error);
      this.set(0);
    }
  },
});

// Bookmark metrics
const totalBookmarksGauge = new Gauge({
  name: "karakeep_total_bookmarks",
  help: "Total number of bookmarks in the system",
  async collect() {
    try {
      const result = await db.select({ count: count() }).from(bookmarks);
      this.set(result[0]?.count ?? 0);
    } catch (error) {
      console.error("Failed to get bookmark count:", error);
      this.set(0);
    }
  },
});

// Api metrics
const apiRequestsTotalCounter = new Counter({
  name: "karakeep_trpc_requests_total",
  help: "Total number of API requests",
  labelNames: ["type", "path", "is_error"],
});

const apiErrorsTotalCounter = new Counter({
  name: "karakeep_trpc_errors_total",
  help: "Total number of API requests",
  labelNames: ["type", "path", "code"],
});

const apiRequestDurationSummary = new Histogram({
  name: "karakeep_trpc_request_duration_seconds",
  help: "Duration of tRPC requests in seconds",
  labelNames: ["type", "path"],
  buckets: [
    5e-3, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
  ],
});

// Register all metrics
register.registerMetric(queuePendingJobsGauge);
register.registerMetric(totalUsersGauge);
register.registerMetric(totalAssetSizeGauge);
register.registerMetric(totalBookmarksGauge);
register.registerMetric(apiRequestsTotalCounter);
register.registerMetric(apiErrorsTotalCounter);
register.registerMetric(apiRequestDurationSummary);

export {
  queuePendingJobsGauge,
  totalUsersGauge,
  totalAssetSizeGauge,
  totalBookmarksGauge,
  apiRequestsTotalCounter,
  apiErrorsTotalCounter,
  apiRequestDurationSummary,
};
