import { count, sum } from "drizzle-orm";
import { Counter, Gauge, Histogram, register } from "prom-client";
import type { Metric } from "prom-client";

import { db } from "@karakeep/db";
import { assets, bookmarks, subscriptions, users } from "@karakeep/db/schema";
import {
  AdminMaintenanceQueue,
  AssetPreprocessingQueue,
  BackupQueue,
  FeedQueue,
  LinkCrawlerQueue,
  LowPriorityCrawlerQueue,
  OpenAIQueue,
  RuleEngineQueue,
  SearchIndexingQueue,
  VideoWorkerQueue,
  WebhookQueue,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";

function getOrCreateMetric<T extends Metric>(
  name: string,
  createMetric: () => T,
): T {
  return (register.getSingleMetric(name) as T | undefined) ?? createMetric();
}

// Queue metrics
const queuePendingJobsGauge = getOrCreateMetric(
  "karakeep_queue_jobs",
  () =>
    new Gauge({
      name: "karakeep_queue_jobs",
      help: "Number of jobs in each background queue",
      labelNames: ["queue_name", "status"],
      async collect() {
        const queues = [
          { name: "link_crawler", queue: LinkCrawlerQueue },
          { name: "low_priority_crawler", queue: LowPriorityCrawlerQueue },
          { name: "backup", queue: BackupQueue },
          { name: "openai", queue: OpenAIQueue },
          { name: "search_indexing", queue: SearchIndexingQueue },
          { name: "admin_maintenance", queue: AdminMaintenanceQueue },
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
              return {
                name,
                pending: 0,
                pending_retry: 0,
                failed: 0,
                running: 0,
              };
            }
          }),
        );

        stats.forEach(({ name, pending, pending_retry, failed, running }) => {
          this.set({ queue_name: name, status: "pending" }, pending);
          this.set(
            { queue_name: name, status: "pending_retry" },
            pending_retry,
          );
          this.set({ queue_name: name, status: "failed" }, failed);
          this.set({ queue_name: name, status: "running" }, running);
        });
      },
    }),
);

// User metrics
const totalUsersGauge = getOrCreateMetric(
  "karakeep_total_users",
  () =>
    new Gauge({
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
    }),
);

if (serverConfig.stripe.isConfigured) {
  getOrCreateMetric(
    "karakeep_subscription_status",
    () =>
      new Gauge({
        name: "karakeep_subscription_status",
        help: "Total number of subscriptions per status",
        labelNames: ["status", "tier"],
        async collect() {
          this.reset();
          try {
            const results = await db
              .select({
                status: subscriptions.status,
                tier: subscriptions.tier,
                count: count(),
              })
              .from(subscriptions)
              .groupBy(subscriptions.status, subscriptions.tier);
            for (const result of results) {
              this.set(
                { status: result.status, tier: result.tier },
                result.count,
              );
            }
          } catch (error) {
            console.error("Failed to get subscription status:", error);
          }
        },
      }),
  );
}

// Asset metrics
const totalAssetSizeGauge = getOrCreateMetric(
  "karakeep_total_asset_size_bytes",
  () =>
    new Gauge({
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
    }),
);

// Bookmark metrics
const totalBookmarksGauge = getOrCreateMetric(
  "karakeep_total_bookmarks",
  () =>
    new Gauge({
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
    }),
);

// Bookmark creation metrics
const bookmarkCreationCounter = getOrCreateMetric(
  "karakeep_bookmark_creations_total",
  () =>
    new Counter({
      name: "karakeep_bookmark_creations_total",
      help: "Total number of bookmarks created",
      labelNames: ["source"],
    }),
);

// Api metrics
const apiRequestsTotalCounter = getOrCreateMetric(
  "karakeep_trpc_requests_total",
  () =>
    new Counter({
      name: "karakeep_trpc_requests_total",
      help: "Total number of API requests",
      labelNames: ["type", "path", "is_error"],
    }),
);

const apiErrorsTotalCounter = getOrCreateMetric(
  "karakeep_trpc_errors_total",
  () =>
    new Counter({
      name: "karakeep_trpc_errors_total",
      help: "Total number of API requests",
      labelNames: ["type", "path", "code"],
    }),
);

const apiRequestDurationSummary = getOrCreateMetric(
  "karakeep_trpc_request_duration_seconds",
  () =>
    new Histogram({
      name: "karakeep_trpc_request_duration_seconds",
      help: "Duration of tRPC requests in seconds",
      labelNames: ["type", "path"],
      buckets: [
        5e-3, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5,
        10,
      ],
    }),
);

export {
  queuePendingJobsGauge,
  totalUsersGauge,
  totalAssetSizeGauge,
  totalBookmarksGauge,
  bookmarkCreationCounter,
  apiRequestsTotalCounter,
  apiErrorsTotalCounter,
  apiRequestDurationSummary,
};
