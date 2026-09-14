import { and, eq, inArray } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import cron from "node-cron";
import { withWorkerEventLog, withWorkerTracing } from "workerTracing";
import { z } from "zod";

import type { ZSmartGroupsRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  bookmarkClusters,
  bookmarkLinks,
  bookmarks,
  bookmarksInClusters,
  bookmarkTags,
  tagsOnBookmarks,
  users,
} from "@karakeep/db/schema";
import {
  addLogFields,
  SmartGroupsQueue,
  zSmartGroupsRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import { getVectorStoreClient } from "@karakeep/shared/vectorStore";

import {
  BookmarkCluster,
  clusterBySimilarity,
  SimilarityEdge,
} from "./utils/clustering";

// How many neighbors to request per bookmark when building the similarity
// graph. Higher than the "related bookmarks" panel's limit (6) because this
// graph needs to be dense enough for union-find to find real components.
const NEIGHBORS_PER_BOOKMARK = 15;
// How many bookmarks to fan out findSimilar() calls for at once. Keeps this
// job from hammering the vector store on large libraries.
const FIND_SIMILAR_CONCURRENCY = 5;
// A new cluster is considered "the same" as an existing one (so its id/label
// are kept instead of being deleted-and-recreated) when they share at least
// this fraction of members (Jaccard similarity).
const CLUSTER_MATCH_JACCARD_THRESHOLD = 0.5;
const SMART_GROUPS_ALGO_VERSION = 1;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  async function worker() {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

export const SmartGroupsRefreshingWorker = cron.schedule(
  serverConfig.smartGroups.recomputeCron,
  async () => {
    if (
      !serverConfig.smartGroups.enabled ||
      !serverConfig.embedding.enableAutoIndexing
    ) {
      return;
    }
    logger.info("[smartGroups] Scheduling smart groups recompute jobs ...");
    try {
      const allUsers = await db.select({ id: users.id }).from(users);
      for (const user of allUsers) {
        await SmartGroupsQueue.enqueue(
          { userId: user.id },
          {
            idempotencyKey: `smart-groups-${user.id}-${new Date().toISOString().slice(0, 13)}`,
            groupId: user.id,
          },
        );
      }
    } catch (error) {
      logger.error(
        `[smartGroups] Error scheduling smart groups jobs: ${error}`,
      );
    }
  },
  {
    runOnInit: false,
    scheduled: false,
  },
);

export class SmartGroupsWorker {
  static async build() {
    logger.info("Starting smart groups worker ...");
    const worker = (await getQueueClient()).createRunner<ZSmartGroupsRequest>(
      SmartGroupsQueue,
      {
        run: withWorkerTracing(
          "smartGroupsWorker.run",
          withWorkerEventLog("smartGroupsWorker.run", run),
        ),
        onComplete: async (job) => {
          workerStatsCounter.labels("smartGroups", "completed").inc();
          logger.info(`[smartGroups][${job.id}] Completed successfully`);
        },
        onError: async (job) => {
          workerStatsCounter.labels("smartGroups", "failed").inc();
          logger.error(
            `[smartGroups][${job.id}] Smart groups job failed: ${job.error}\n${job.error.stack}`,
          );
        },
      },
      {
        concurrency: 1,
        pollIntervalMs: 1000,
        timeoutSecs: 300,
        validator: zSmartGroupsRequestSchema,
      },
    );
    return worker;
  }
}

async function run(req: DequeuedJob<ZSmartGroupsRequest>): Promise<void> {
  const { userId } = req.data;
  addLogFields<"smartGroupsWorker.run">({ "user.id": userId });

  if (
    !serverConfig.smartGroups.enabled ||
    !serverConfig.embedding.enableAutoIndexing
  ) {
    return;
  }

  const vectorStoreClient = await getVectorStoreClient();
  if (!vectorStoreClient) {
    logger.warn(
      `[smartGroups][${req.id}] No vector store configured, skipping`,
    );
    return;
  }

  const candidateBookmarks = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.embeddingStatus, "success"),
      ),
    );
  const bookmarkIds = candidateBookmarks.map((b) => b.id);
  addLogFields<"smartGroupsWorker.run">({
    "smart_groups.candidate_bookmarks": bookmarkIds.length,
  });

  let clusters: BookmarkCluster[] = [];
  if (bookmarkIds.length >= serverConfig.smartGroups.minClusterSize) {
    const userFilter = [
      { type: "eq" as const, field: "userId" as const, value: userId },
    ];
    const edgeLists = await mapWithConcurrency(
      bookmarkIds,
      FIND_SIMILAR_CONCURRENCY,
      async (id): Promise<SimilarityEdge[]> => {
        const { hits } = await vectorStoreClient.findSimilar({
          id,
          limit: NEIGHBORS_PER_BOOKMARK,
          filter: userFilter,
        });
        return hits.map((h) => ({
          bookmarkId: id,
          neighborId: h.id,
          score: h.score,
        }));
      },
    );
    const edges = edgeLists.flat();
    addLogFields<"smartGroupsWorker.run">({
      "smart_groups.edges": edges.length,
    });

    clusters = clusterBySimilarity(bookmarkIds, edges, {
      threshold: serverConfig.smartGroups.similarityThreshold,
      minClusterSize: serverConfig.smartGroups.minClusterSize,
    });
  }
  addLogFields<"smartGroupsWorker.run">({
    "smart_groups.clusters_found": clusters.length,
  });

  await reconcileClusters(userId, clusters, req.id);
}

async function reconcileClusters(
  userId: string,
  computedClusters: BookmarkCluster[],
  jobId: string,
): Promise<void> {
  const existing = await db.query.bookmarkClusters.findMany({
    where: eq(bookmarkClusters.userId, userId),
    with: { bookmarksInClusters: true },
  });

  const claimed = new Set<string>();
  const matches = computedClusters.map((cluster) => {
    const memberSet = new Set(cluster.members);
    let best: { id: string; jaccard: number } | null = null;
    for (const existingCluster of existing) {
      if (claimed.has(existingCluster.id)) {
        continue;
      }
      const existingMembers = new Set(
        existingCluster.bookmarksInClusters.map((m) => m.bookmarkId),
      );
      const intersection = [...memberSet].filter((id) =>
        existingMembers.has(id),
      ).length;
      const union = new Set([...memberSet, ...existingMembers]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      if (jaccard >= CLUSTER_MATCH_JACCARD_THRESHOLD) {
        if (!best || jaccard > best.jaccard) {
          best = { id: existingCluster.id, jaccard };
        }
      }
    }
    if (best) {
      claimed.add(best.id);
    }
    return { cluster, existingId: best?.id };
  });

  let created = 0;
  let updated = 0;
  const now = new Date();

  for (const { cluster, existingId } of matches) {
    const existingCluster = existingId
      ? existing.find((c) => c.id === existingId)
      : undefined;
    const existingMemberIds = existingCluster
      ? new Set(existingCluster.bookmarksInClusters.map((m) => m.bookmarkId))
      : new Set<string>();
    const sameMembers =
      existingCluster &&
      existingMemberIds.size === cluster.members.length &&
      cluster.members.every((id) => existingMemberIds.has(id));

    if (sameMembers) {
      // Membership unchanged - leave label, id, and rows untouched.
      continue;
    }

    const label = await buildClusterLabel(cluster.members, jobId);

    await db.transaction((tx) => {
      let clusterId = existingCluster?.id;
      if (existingCluster) {
        tx.update(bookmarkClusters)
          .set({
            label,
            updatedAt: now,
            algoVersion: SMART_GROUPS_ALGO_VERSION,
          })
          .where(eq(bookmarkClusters.id, existingCluster.id))
          .run();
        tx.delete(bookmarksInClusters)
          .where(eq(bookmarksInClusters.clusterId, existingCluster.id))
          .run();
      } else {
        const inserted = tx
          .insert(bookmarkClusters)
          .values({
            userId,
            label,
            updatedAt: now,
            algoVersion: SMART_GROUPS_ALGO_VERSION,
          })
          .returning({ id: bookmarkClusters.id })
          .all();
        clusterId = inserted[0].id;
      }
      if (clusterId) {
        tx.insert(bookmarksInClusters)
          .values(
            cluster.members.map((bookmarkId) => ({
              clusterId: clusterId as string,
              bookmarkId,
              score: cluster.memberScores[bookmarkId] ?? null,
            })),
          )
          .run();
      }
    });

    if (existingCluster) {
      updated++;
    } else {
      created++;
    }
  }

  const staleClusterIds = existing
    .filter((c) => !claimed.has(c.id))
    .map((c) => c.id);
  if (staleClusterIds.length > 0) {
    await db.transaction((tx) => {
      tx.delete(bookmarkClusters)
        .where(inArray(bookmarkClusters.id, staleClusterIds))
        .run();
    });
  }

  addLogFields<"smartGroupsWorker.run">({
    "smart_groups.clusters_created": created,
    "smart_groups.clusters_updated": updated,
    "smart_groups.clusters_deleted": staleClusterIds.length,
  });
}

const zClusterLabelSchema = z.object({ label: z.string() });

async function buildClusterLabel(
  memberIds: string[],
  jobId: string,
): Promise<string> {
  const sampleIds = memberIds.slice(0, 8);
  const [titledBookmarks, tagRows, linkRows] = await Promise.all([
    db
      .select({ id: bookmarks.id, title: bookmarks.title })
      .from(bookmarks)
      .where(inArray(bookmarks.id, sampleIds)),
    db
      .select({ name: bookmarkTags.name })
      .from(tagsOnBookmarks)
      .innerJoin(bookmarkTags, eq(bookmarkTags.id, tagsOnBookmarks.tagId))
      .where(inArray(tagsOnBookmarks.bookmarkId, memberIds)),
    db
      .select({ url: bookmarkLinks.url })
      .from(bookmarkLinks)
      .where(inArray(bookmarkLinks.id, memberIds)),
  ]);

  const fallbackLabel = buildFallbackLabel(memberIds.length, tagRows, linkRows);

  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    return fallbackLabel;
  }

  const titles = titledBookmarks
    .map((b) => b.title)
    .filter((t): t is string => !!t)
    .slice(0, 8);
  if (titles.length === 0) {
    return fallbackLabel;
  }

  try {
    const prompt = [
      "You are labeling a cluster of bookmarks that a similarity algorithm",
      "grouped together because they're about the same topic. Given these",
      "bookmark titles, respond with a short 2-4 word label for the group.",
      'Respond with JSON matching {"label": string}. No extra commentary.',
      "",
      ...titles.map((t) => `- ${t}`),
    ].join("\n");

    const response = await inferenceClient.inferFromText(prompt, {
      schema: zClusterLabelSchema,
    });
    const parsed = zClusterLabelSchema.parse(JSON.parse(response.response));
    const label = parsed.label.trim();
    return label.length > 0 ? label : fallbackLabel;
  } catch (error) {
    logger.warn(
      `[smartGroups][${jobId}] Failed to LLM-label a cluster, falling back: ${error}`,
    );
    return fallbackLabel;
  }
}

function buildFallbackLabel(
  memberCount: number,
  tagRows: { name: string }[],
  linkRows: { url: string }[],
): string {
  const tagCounts = new Map<string, number>();
  for (const { name } of tagRows) {
    tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
  }
  const topTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topTag && topTag[1] >= memberCount / 2) {
    return topTag[0];
  }

  const domainCounts = new Map<string, number>();
  for (const { url } of linkRows) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      domainCounts.set(host, (domainCounts.get(host) ?? 0) + 1);
    } catch {
      // ignore unparsable URLs
    }
  }
  const topDomain = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDomain && topDomain[1] >= memberCount / 2) {
    return topDomain[0];
  }

  return `${memberCount} related bookmarks`;
}
