import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import { withWorkerEventLog, withWorkerTracing } from "workerTracing";

import type { ZEmbeddingsRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import {
  addLogFields,
  EmbeddingsQueue,
  OpenAIQueue,
  zEmbeddingsRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
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

async function buildEmbeddingText(
  bookmark: NonNullable<Awaited<ReturnType<typeof fetchBookmark>>>,
): Promise<string | null> {
  const parts: string[] = [];

  appendProfileField(parts, "Title", bookmark.title);
  parts.push(`Type: ${bookmark.type}`);

  const tags = bookmark.tagsOnBookmarks.map((t) => t.tag.name).sort();
  if (tags.length > 0) {
    parts.push(`Tags: ${tags.join(", ")}`);
  }

  appendProfileField(parts, "Summary", bookmark.summary);
  appendProfileField(parts, "Note", bookmark.note);

  let rawContent: string | null = null;

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
    rawContent = await Bookmark.getBookmarkPlainTextContent(
      bookmark.link,
      bookmark.userId,
    );
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
    rawContent = bookmark.text.text;
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
    rawContent = bookmark.asset.content;
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

  const fullText = parts.join("\n\n");
  const maxTextLength = serverConfig.embedding.contextLength;
  return fullText.length > maxTextLength
    ? fullText.substring(0, maxTextLength)
    : fullText;
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
      const document: BookmarkVectorDocument = {
        id: bookmarkId,
        userId: data.userId,
        vector: data.embedding,
      };
      await vectorStoreClient.addVectors([document]);
      logger.info(
        `[embeddings][${jobId}] Indexed embedding for bookmark ${bookmarkId} with ${data.embedding.length} dimensions`,
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

  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.debug(
      `[embeddings][${jobId}] No inference client configured, skipping embedding generation`,
    );
    if (shouldTag) {
      await enqueueTagging(bookmarkId, bookmark.userId, job.priority);
    }
    return;
  }

  const embeddingText = await buildEmbeddingText(bookmark);
  if (!embeddingText) {
    logger.info(
      `[embeddings][${jobId}] No content found for bookmark ${bookmarkId}, skipping embedding generation`,
    );
    if (shouldTag) {
      await enqueueTagging(bookmarkId, bookmark.userId, job.priority);
    }
    return;
  }

  addLogFields<"embeddingsWorker.run">({
    "embedding.text_size": embeddingText.length,
  });
  logger.debug(
    `[embeddings][${jobId}] Embedding text length: ${embeddingText.length} characters`,
  );

  const embeddingResponse = await inferenceClient.generateEmbeddingFromText([
    embeddingText,
  ]);

  if (
    !embeddingResponse.embeddings ||
    embeddingResponse.embeddings.length === 0
  ) {
    throw new Error(
      `[embeddings][${jobId}] No embeddings returned from inference client`,
    );
  }

  const embedding = embeddingResponse.embeddings[0]!;
  addLogFields<"embeddingsWorker.run">({
    "embedding.prompt_tokens": embeddingResponse.promptTokens,
    "embedding.total_tokens": embeddingResponse.totalTokens,
  });

  // Hand off persistence to a separate "index" job whose retries are isolated
  // from tagging, then dispatch tagging last so nothing after it can throw and
  // cause this run to retry (and double-enqueue tagging).
  await EmbeddingsQueue.enqueue(
    {
      type: "index",
      bookmarkId,
      userId: bookmark.userId,
      embedding,
    },
    {
      priority: job.priority,
      groupId: bookmark.userId,
    },
  );
  if (shouldTag) {
    await enqueueTagging(bookmarkId, bookmark.userId, job.priority, embedding);
  }

  logger.info(
    `[embeddings][${jobId}] Generated embedding for bookmark ${bookmarkId} with ${embedding.length} dimensions using ${embeddingResponse.totalTokens ?? "unknown"} tokens; dispatched indexing${shouldTag ? " + tagging" : ""}`,
  );
}
