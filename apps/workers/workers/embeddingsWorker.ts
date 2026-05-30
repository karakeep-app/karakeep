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
  EnqueueOptions,
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
          if (shouldRunTaggingOnComplete(job.data)) {
            await enqueueTaggingAfterEmbeddings(job);
          }
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
            if (job.data && shouldRunTaggingOnComplete(job.data)) {
              await enqueueTaggingAfterEmbeddings(job);
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
    if (request.type !== "index") {
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

function shouldRunTaggingOnComplete(request: ZEmbeddingsRequest) {
  return request.type !== "delete" && request.runTaggingOnComplete !== false;
}

async function enqueueTaggingAfterEmbeddings(
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

  const enqueueOpts: EnqueueOptions = {
    priority: job.priority,
    groupId: bookmark.userId,
  };
  await OpenAIQueue.enqueue(
    {
      bookmarkId,
      type: "tag",
    },
    enqueueOpts,
  );
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

async function runEmbeddings(job: DequeuedJob<ZEmbeddingsRequest>) {
  const jobId = job.id;

  const { bookmarkId, force, type: opType } = job.data;
  addLogFields<"embeddingsWorker.run">({
    "bookmark.id": bookmarkId,
  });

  if (
    opType === "index" &&
    !serverConfig.embedding.enableAutoIndexing &&
    !force
  ) {
    logger.debug(
      `[embeddings][${jobId}] Bookmark embedding indexing is disabled, skipping embedding generation`,
    );
    return;
  }

  const vectorStoreClient = await getVectorStoreClient();
  if (!vectorStoreClient) {
    logger.debug(
      `[embeddings][${jobId}] Vector store is not configured, skipping embedding ${opType}`,
    );
    return;
  }

  if (opType === "delete") {
    await vectorStoreClient.deleteVectors([bookmarkId]);
    logger.info(`[embeddings][${jobId}] Deleted embedding for ${bookmarkId}`);
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
    return;
  }

  const embeddingText = await buildEmbeddingText(bookmark);
  if (!embeddingText) {
    logger.info(
      `[embeddings][${jobId}] No content found for bookmark ${bookmarkId}, skipping embedding generation`,
    );
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
  const document: BookmarkVectorDocument = {
    id: bookmark.id,
    userId: bookmark.userId,
    vector: embedding,
  };

  await vectorStoreClient.addVectors([document]);

  logger.info(
    `[embeddings][${jobId}] Indexed embedding for bookmark ${bookmarkId} with ${embedding.length} dimensions using ${embeddingResponse.totalTokens ?? "unknown"} tokens`,
  );
}
