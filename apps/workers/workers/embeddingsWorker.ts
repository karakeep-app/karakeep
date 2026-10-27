import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import type { ZEmbeddingsRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import {
  addLogFields,
  EmbeddingsQueue,
  OpenAIQueue,
  triggerEmbeddingRefresh,
  zEmbeddingsRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { EmbeddingClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import {
  DequeuedJob,
  DequeuedJobError,
  getQueueClient,
} from "@karakeep/shared/queueing";
import {
  BookmarkVectorDocument,
  getVectorStoreClient,
} from "@karakeep/shared/vectorStore";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

import { workerStatsCounter } from "../metrics";
import { withWorkerEventLog, withWorkerTracing } from "../workerTracing";

const MAX_EMBEDDING_CONTENT_EXCERPT_LENGTH = 3000;
const MAX_EMBEDDING_METADATA_LENGTH = 800;

export class EmbeddingsWorker {
  static async build() {
    logger.info("Starting embeddings worker ...");
    const worker = (await getQueueClient()).createRunner<ZEmbeddingsRequest>(
      EmbeddingsQueue,
      {
        run: withWorkerTracing(
          "embeddingsWorker.run",
          withWorkerEventLog("embeddingsWorker.run", runEmbeddings),
        ),
        onComplete: async (job) => {
          workerStatsCounter.labels("embeddings", "completed").inc();
          const jobId = job.id;
          logger.info(`[embeddings][${jobId}] Completed successfully`);
          await attemptMarkEmbeddingStatus(job.data, "success");
        },
        onError: async (job) => {
          workerStatsCounter.labels("embeddings", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[embeddings][${jobId}] embeddings job failed: ${job.error}\n${job.error.stack}`,
          );
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("embeddings", "failed_permanent").inc();
            await attemptMarkEmbeddingStatus(job.data, "failure");
            // If embedding generation permanently failed, still tag the bookmark
            // (without similarity context) so it isn't left untagged.
            if (
              job.data?.type === "embed" &&
              job.data.runTaggingOnComplete !== false
            ) {
              await enqueueTaggingFallback(job);
            }
          }
        },
      },
      {
        concurrency: serverConfig.embedding.numWorkers,
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.embedding.jobTimeoutSec,
        validator: zEmbeddingsRequestSchema,
      },
    );

    return worker;
  }
}

async function attemptMarkEmbeddingStatus(
  jobData: object | undefined,
  status: "success" | "failure",
) {
  if (!jobData) {
    return;
  }
  try {
    const request = zEmbeddingsRequestSchema.parse(jobData);
    if (
      request.type !== "index" &&
      !(request.type === "embed" && status === "failure")
    ) {
      return;
    }
    await db
      .update(bookmarks)
      .set({ embeddingStatus: status })
      .where(eq(bookmarks.id, request.bookmarkId));
  } catch (e) {
    logger.error(
      `Something went wrong when marking the embedding status: ${e}`,
    );
  }
}

async function enqueueTagging(
  bookmarkId: string,
  userId: string,
  priority: number | undefined,
  embedding?: number[],
) {
  await OpenAIQueue.enqueue(
    {
      bookmarkId,
      type: "tag",
      ...(embedding ? { embedding } : {}),
    },
    {
      priority,
      groupId: userId,
    },
  );
}

// Enqueue a vector-less tag job when the embed run produced no embedding (early
// returns / permanent generation failure). Looks up the user since the embed
// payload only carries the bookmark id.
async function enqueueTaggingFallback(
  job: DequeuedJob<ZEmbeddingsRequest> | DequeuedJobError<ZEmbeddingsRequest>,
) {
  const bookmarkId = job.data?.bookmarkId;
  if (!bookmarkId) {
    return;
  }
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: {
      userId: true,
    },
  });
  if (!bookmark) {
    logger.warn(
      `[embeddings][${job.id}] Bookmark ${bookmarkId} not found, skipping tag enqueue`,
    );
    return;
  }
  await enqueueTagging(bookmarkId, bookmark.userId, job.priority);
}

async function fetchBookmark(bookmarkId: string) {
  return await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      link: true,
      text: true,
      asset: true,
      tagsOnBookmarks: {
        with: {
          tag: true,
        },
      },
    },
  });
}

export type EmbeddableBookmark = NonNullable<
  Awaited<ReturnType<typeof fetchBookmark>>
>;

function normalizeEmbeddingText(text: string | null | undefined) {
  const normalized = text?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function appendEmbeddingField(
  parts: string[],
  label: string,
  value: string | null | undefined,
) {
  const normalized = normalizeEmbeddingText(value);
  if (normalized) {
    parts.push(`${label}: ${normalized}`);
  }
}

function hostnameFromUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function urlForEmbedding(url: string | null | undefined) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return normalizeEmbeddingText(url);
  }
}

function metadataForEmbedding(metadata: string | null | undefined) {
  const normalized = normalizeEmbeddingText(metadata);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const fields: string[] = [];
      for (const [key, value] of Object.entries(parsed)) {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          fields.push(`${key}: ${value}`);
        }
      }
      if (fields.length > 0) {
        return truncateText(fields.join("; "), MAX_EMBEDDING_METADATA_LENGTH);
      }
    }
  } catch {
    // Fall back to the raw metadata string.
  }

  return truncateText(normalized, MAX_EMBEDDING_METADATA_LENGTH);
}

function appendProfileField(parts: string[], label: string, value: unknown) {
  if (value instanceof Date) {
    parts.push(`${label}: ${value.toISOString().slice(0, 10)}`);
    return;
  }
  if (typeof value !== "string") {
    return;
  }
  const normalized = normalizeEmbeddingText(value);
  if (normalized) {
    parts.push(`${label}: ${normalized}`);
  }
}

function contentBudget(maxTextLength: number) {
  return Math.max(
    500,
    Math.min(
      MAX_EMBEDDING_CONTENT_EXCERPT_LENGTH,
      Math.floor(maxTextLength * 0.4),
    ),
  );
}

export interface EmbeddingTexts {
  search: string | null;
  similar: string | null;
}

/**
 * Builds the lean text that gets embedded for similar-article lookups.
 *
 * - When a summary exists, similarity is based on `Title` + `Summary`. The
 *   summary is the distilled signal, so URL/metadata/tags are intentionally
 *   left out.
 * - Before a summary exists (or for bookmark types that aren't summarized),
 *   fall back to `Title` + the readable `Content excerpt`.
 */
function buildSimilarEmbeddingTextFromContent(
  bookmark: EmbeddableBookmark,
  rawContent: string | null,
): string | null {
  const parts: string[] = [];

  // Prefer the user-provided title, then fall back to the crawled page title
  // or the asset file name.
  const title = bookmark.title?.trim()
    ? bookmark.title
    : (bookmark.link?.title ?? bookmark.asset?.fileName ?? null);
  appendEmbeddingField(parts, "Title", title);

  const summary = normalizeEmbeddingText(bookmark.summary);
  if (summary) {
    parts.push(`Summary: ${summary}`);
  } else {
    const normalizedContent = normalizeEmbeddingText(rawContent);
    if (normalizedContent) {
      parts.push(
        `Content excerpt: ${truncateText(
          normalizedContent,
          contentBudget(serverConfig.embedding.contextLength),
        )}`,
      );
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return truncateToContextLength(parts.join("\n\n"));
}

/**
 * Builds the lean similar-articles embedding text for a bookmark.
 */
export async function buildSimilarEmbeddingText(
  bookmark: EmbeddableBookmark,
): Promise<string | null> {
  return buildSimilarEmbeddingTextFromContent(
    bookmark,
    await getRawContent(bookmark),
  );
}

/**
 * Builds the rich search-profile text that gets embedded for semantic search
 * and tag suggestions. Deliberately much broader than the similar-articles
 * text: those two features need to match on tags, domains, notes, and
 * metadata — which would only add noise to similarity ranking.
 */
function buildSearchEmbeddingTextFromContent(
  bookmark: EmbeddableBookmark,
  rawContent: string | null,
): string | null {
  const parts: string[] = [];

  appendProfileField(parts, "Title", bookmark.title);
  parts.push(`Type: ${bookmark.type}`);

  const tags = bookmark.tagsOnBookmarks.map((t) => t.tag.name).sort();
  if (tags.length > 0) {
    parts.push(`Tags: ${tags.join(", ")}`);
  }

  appendProfileField(parts, "Summary", bookmark.summary);
  appendProfileField(parts, "Note", bookmark.note);

  if (bookmark.link) {
    appendProfileField(parts, "Domain", hostnameFromUrl(bookmark.link.url));
    appendProfileField(parts, "URL", urlForEmbedding(bookmark.link.url));
    if (
      bookmark.link.title &&
      normalizeEmbeddingText(bookmark.link.title) !==
        normalizeEmbeddingText(bookmark.title)
    ) {
      appendProfileField(parts, "Page title", bookmark.link.title);
    }
    appendProfileField(parts, "Description", bookmark.link.description);
    appendProfileField(parts, "Author", bookmark.link.author);
    appendProfileField(parts, "Publisher", bookmark.link.publisher);
    appendProfileField(parts, "Published", bookmark.link.datePublished);
  } else if (bookmark.text) {
    appendProfileField(
      parts,
      "Source URL",
      urlForEmbedding(bookmark.text.sourceUrl),
    );
    appendProfileField(
      parts,
      "Source domain",
      hostnameFromUrl(bookmark.text.sourceUrl),
    );
  } else if (bookmark.asset) {
    appendProfileField(
      parts,
      "Source URL",
      urlForEmbedding(bookmark.asset.sourceUrl),
    );
    appendProfileField(
      parts,
      "Source domain",
      hostnameFromUrl(bookmark.asset.sourceUrl),
    );
    appendProfileField(parts, "File name", bookmark.asset.fileName);
    appendProfileField(parts, "Asset type", bookmark.asset.assetType);
    appendProfileField(
      parts,
      "Metadata",
      metadataForEmbedding(bookmark.asset.metadata),
    );
  }

  const normalizedContent = normalizeEmbeddingText(rawContent);
  if (normalizedContent) {
    parts.push(
      `Content excerpt: ${truncateText(
        normalizedContent,
        contentBudget(serverConfig.embedding.contextLength),
      )}`,
    );
  }

  if (parts.length === 0) {
    return null;
  }

  return truncateToContextLength(parts.join("\n\n"));
}

/**
 * Builds the rich semantic-search / tag-suggestion embedding text for a
 * bookmark.
 */
export async function buildSearchEmbeddingText(
  bookmark: EmbeddableBookmark,
): Promise<string | null> {
  return buildSearchEmbeddingTextFromContent(
    bookmark,
    await getRawContent(bookmark),
  );
}

/**
 * Builds both embedding texts for a bookmark: the lean similar-articles text
 * and the rich semantic-search profile text. The (potentially expensive)
 * content read is shared between the two.
 */
export async function buildEmbeddingTexts(
  bookmark: EmbeddableBookmark,
): Promise<EmbeddingTexts> {
  const rawContent = await getRawContent(bookmark);
  return {
    similar: buildSimilarEmbeddingTextFromContent(bookmark, rawContent),
    search: buildSearchEmbeddingTextFromContent(bookmark, rawContent),
  };
}

async function getRawContent(
  bookmark: EmbeddableBookmark,
): Promise<string | null> {
  if (bookmark.link) {
    return await Bookmark.getBookmarkPlainTextContent(
      bookmark.link,
      bookmark.userId,
    );
  } else if (bookmark.text) {
    return bookmark.text.text;
  } else if (bookmark.asset) {
    return bookmark.asset.content;
  }
  return null;
}

function truncateToContextLength(fullText: string): string {
  const maxTextLength = serverConfig.embedding.contextLength;
  return fullText.length > maxTextLength
    ? fullText.substring(0, maxTextLength)
    : fullText;
}

function fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

type EmbedRequest = Extract<ZEmbeddingsRequest, { type: "embed" }>;

async function runEmbeddings(job: DequeuedJob<ZEmbeddingsRequest>) {
  const jobId = job.id;
  const data = job.data;
  const bookmarkId = data.bookmarkId;
  addLogFields<"embeddingsWorker.run">({
    "bookmark.id": bookmarkId,
    "embedding.mode": data.type,
  });

  const vectorStoreClient = await getVectorStoreClient();
  if (!vectorStoreClient) {
    logger.debug(
      `[embeddings][${jobId}] Vector store is not configured, skipping embedding ${data.type}`,
    );
    // The vector cannot be stored, but the bookmark should still be tagged.
    if (data.type === "embed" && data.runTaggingOnComplete !== false) {
      await enqueueTaggingFallback(job);
    }
    return;
  }

  switch (data.type) {
    case "delete": {
      await vectorStoreClient.deleteVectors([bookmarkId]);
      logger.info(`[embeddings][${jobId}] Deleted embedding for ${bookmarkId}`);
      return;
    }
    case "index": {
      // Guard against stale generations: the bookmark may have changed (or
      // been deleted) between the vector generation and this run. Re-derive
      // the texts and only index when they still match what the vectors were
      // computed from; otherwise enqueue a fresh embed job, which regenerates
      // from the current state.
      const bookmark = await fetchBookmark(bookmarkId);
      if (!bookmark) {
        logger.info(
          `[embeddings][${jobId}] Bookmark ${bookmarkId} not found anymore, skipping vector indexing`,
        );
        return;
      }
      if (data.fingerprints) {
        const fingerprints = data.fingerprints;
        const current = await buildEmbeddingTexts(bookmark);
        const isStale = (["search", "similar"] as const).some((slot) => {
          const expected = fingerprints[slot];
          if (!expected) {
            return false;
          }
          return !current[slot] || fingerprint(current[slot]!) !== expected;
        });
        if (isStale) {
          logger.info(
            `[embeddings][${jobId}] Bookmark text changed since the vectors were generated, skipping stale indexing and re-enqueueing an embed`,
          );
          await triggerEmbeddingRefresh(bookmarkId, {
            priority: job.priority,
            groupId: bookmark.userId,
          });
          return;
        }
      }
      const document: BookmarkVectorDocument = {
        id: bookmarkId,
        userId: data.userId,
        vectors: {
          search: data.embedding,
          similar: data.similarEmbedding ?? null,
        },
      };
      await vectorStoreClient.addVectors([document]);
      logger.info(
        `[embeddings][${jobId}] Indexed embedding for bookmark ${bookmarkId} with ${data.embedding.length} dimensions${data.similarEmbedding ? ` (and a ${data.similarEmbedding.length}-dimensional similar-articles vector)` : ""}`,
      );
      return;
    }
    case "embed": {
      await runEmbed(job, data);
      return;
    }
  }
}

// Generates the bookmark embedding and dispatches both the tagging job (carrying
// the vector, so tagging need not wait for indexing) and a separate "index" job
// that persists the vector. This run never calls addVectors, so it does not
// retry on indexing failures and therefore never re-triggers tagging.
async function runEmbed(
  job: DequeuedJob<ZEmbeddingsRequest>,
  data: EmbedRequest,
) {
  const jobId = job.id;
  const { bookmarkId, force } = data;
  const shouldTag = data.runTaggingOnComplete !== false;

  if (!serverConfig.embedding.enableAutoIndexing && !force) {
    logger.debug(
      `[embeddings][${jobId}] Bookmark embedding indexing is disabled, skipping embedding generation`,
    );
    if (shouldTag) {
      await enqueueTaggingFallback(job);
    }
    return;
  }

  const bookmark = await fetchBookmark(bookmarkId);
  if (!bookmark) {
    logger.warn(
      `[embeddings][${jobId}] Bookmark ${bookmarkId} not found, it might have been deleted already. Skipping ...`,
    );
    return;
  }

  addLogFields<"embeddingsWorker.run">({
    "user.id": bookmark.userId,
  });

  const embeddingClient = EmbeddingClientFactory.build();
  if (!embeddingClient) {
    logger.debug(
      `[embeddings][${jobId}] No embedding client configured, skipping embedding generation`,
    );
    if (shouldTag) {
      await enqueueTagging(bookmarkId, bookmark.userId, job.priority);
    }
    return;
  }

  const embeddingTexts = await buildEmbeddingTexts(bookmark);
  const slots = ["search", "similar"] as const;
  const inputs: string[] = [];
  for (const slot of slots) {
    if (embeddingTexts[slot]) {
      inputs.push(embeddingTexts[slot]!);
    }
  }
  if (inputs.length === 0) {
    logger.info(
      `[embeddings][${jobId}] No content found for bookmark ${bookmarkId}, skipping embedding generation`,
    );
    if (shouldTag) {
      await enqueueTagging(bookmarkId, bookmark.userId, job.priority);
    }
    return;
  }

  for (const slot of slots) {
    if (embeddingTexts[slot]) {
      logger.debug(
        `[embeddings][${jobId}] Embedding text length (${slot === "search" ? "search profile" : "similar articles"}): ${embeddingTexts[slot]!.length} characters`,
      );
    }
  }

  // One inference call generates all requested vectors (one per slot). The
  // client validates each returned embedding against EMBEDDING_DIMENSIONS.
  const embeddingResponse =
    await embeddingClient.generateEmbeddingFromText(inputs);

  if (
    !embeddingResponse.embeddings ||
    embeddingResponse.embeddings.length !== inputs.length
  ) {
    throw new Error(
      `[embeddings][${jobId}] No embeddings returned from inference client`,
    );
  }

  const vectors = Object.fromEntries(
    slots
      .filter((slot) => embeddingTexts[slot])
      .map((slot, i) => [slot, embeddingResponse.embeddings[i]!]),
  ) as { search: number[]; similar?: number[] };
  addLogFields<"embeddingsWorker.run">({
    "embedding.prompt_tokens": embeddingResponse.promptTokens,
    "embedding.total_tokens": embeddingResponse.totalTokens,
  });

  // Hand off persistence to a separate "index" job whose retries are isolated
  // from tagging, then dispatch tagging last so nothing after it can throw and
  // cause this run to retry (and double-enqueue tagging). Tagging gets the
  // search-profile vector, matching what semantic search ranks against.
  await EmbeddingsQueue.enqueue(
    {
      type: "index",
      bookmarkId,
      userId: bookmark.userId,
      embedding: vectors.search,
      similarEmbedding: vectors.similar,
      fingerprints: {
        search: fingerprint(embeddingTexts.search!),
        ...(embeddingTexts.similar
          ? { similar: fingerprint(embeddingTexts.similar) }
          : {}),
      },
    },
    {
      priority: job.priority,
      groupId: bookmark.userId,
    },
  );
  if (shouldTag) {
    await enqueueTagging(
      bookmarkId,
      bookmark.userId,
      job.priority,
      vectors.search,
    );
  }

  logger.info(
    `[embeddings][${jobId}] Generated ${inputs.length} embeddings for bookmark ${bookmarkId} (${inputs.map((t) => `${t.length} chars`).join(", ")}) using ${embeddingResponse.totalTokens ?? "unknown"} tokens; dispatched indexing${shouldTag ? " + tagging" : ""}`,
  );
}
