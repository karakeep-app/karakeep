import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";

import type { ZEmbeddingsRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { bookmarkEmbeddings, bookmarks } from "@karakeep/db/schema";
import {
  EmbeddingsQueue,
  triggerEmbeddingsIndexing,
  zEmbeddingsRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

const MAX_EMBEDDING_TEXT_LENGTH = 8000; // Most embedding models have token limits

async function attemptMarkStatus(
  bookmarkId: string | undefined,
  status: "success" | "failure",
) {
  if (!bookmarkId) {
    return;
  }
  try {
    await db
      .update(bookmarks)
      .set({ embeddingStatus: status })
      .where(eq(bookmarks.id, bookmarkId));
  } catch (e) {
    logger.error(
      `[embeddings] Something went wrong when marking the embedding status: ${e}`,
    );
  }
}

export class EmbeddingsWorker {
  static async build() {
    logger.info("Starting embeddings worker ...");
    const worker = (await getQueueClient())!.createRunner<ZEmbeddingsRequest>(
      EmbeddingsQueue,
      {
        run: runEmbeddings,
        onComplete: async (job) => {
          workerStatsCounter.labels("embeddings", "completed").inc();
          const jobId = job.id;
          logger.info(`[embeddings][${jobId}] Completed successfully`);
          await attemptMarkStatus(job.data?.bookmarkId, "success");
        },
        onError: async (job) => {
          workerStatsCounter.labels("embeddings", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[embeddings][${jobId}] embeddings job failed: ${job.error}\n${job.error.stack}`,
          );
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("embeddings", "failed_permanent").inc();
            await attemptMarkStatus(job.data?.bookmarkId, "failure");
          }
        },
      },
      {
        concurrency: serverConfig.inference.numWorkers,
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.inference.jobTimeoutSec,
      },
    );

    return worker;
  }
}

/**
 * Builds a text representation of a bookmark suitable for embedding.
 * Combines title, content, summary, and other relevant fields.
 */
async function buildEmbeddingText(
  bookmark: NonNullable<Awaited<ReturnType<typeof fetchBookmark>>>,
): Promise<string | null> {
  const parts: string[] = [];

  // Add title if available
  if (bookmark.title) {
    parts.push(`Title: ${bookmark.title}`);
  }

  // Add summary if available
  if (bookmark.summary) {
    parts.push(`Summary: ${bookmark.summary}`);
  }

  // Add content based on bookmark type
  if (bookmark.link) {
    if (bookmark.link.title && bookmark.link.title !== bookmark.title) {
      parts.push(`Link Title: ${bookmark.link.title}`);
    }
    if (bookmark.link.description) {
      parts.push(`Description: ${bookmark.link.description}`);
    }
    const content = await Bookmark.getBookmarkPlainTextContent(
      bookmark.link,
      bookmark.userId,
    );
    if (content) {
      parts.push(`Content: ${content}`);
    }
    if (bookmark.link.url) {
      parts.push(`URL: ${bookmark.link.url}`);
    }
  } else if (bookmark.text) {
    if (bookmark.text.text) {
      parts.push(`Content: ${bookmark.text.text}`);
    }
  } else if (bookmark.asset) {
    if (bookmark.asset.content) {
      parts.push(`Content: ${bookmark.asset.content}`);
    }
    if (bookmark.asset.fileName) {
      parts.push(`File Name: ${bookmark.asset.fileName}`);
    }
  }

  // Add note if available
  if (bookmark.note) {
    parts.push(`Note: ${bookmark.note}`);
  }

  // Add tags
  if (bookmark.tagsOnBookmarks && bookmark.tagsOnBookmarks.length > 0) {
    const tagNames = bookmark.tagsOnBookmarks.map((t) => t.tag.name);
    parts.push(`Tags: ${tagNames.join(", ")}`);
  }

  if (parts.length === 0) {
    return null;
  }

  const fullText = parts.join("\n\n");

  // Truncate to max length if needed
  if (fullText.length > MAX_EMBEDDING_TEXT_LENGTH) {
    return fullText.substring(0, MAX_EMBEDDING_TEXT_LENGTH);
  }

  return fullText;
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

/**
 * Converts a number array to a Buffer for storage
 */
function embeddingToBuffer(embedding: number[]): Buffer {
  const float32Array = new Float32Array(embedding);
  return Buffer.from(float32Array.buffer);
}

async function runEmbeddings(job: DequeuedJob<ZEmbeddingsRequest>) {
  const jobId = job.id;

  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.debug(
      `[embeddings][${jobId}] No inference client configured, nothing to do now`,
    );
    return;
  }

  const request = zEmbeddingsRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(
      `[embeddings][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
  }

  const { bookmarkId } = request.data;
  logger.info(
    `[embeddings][${jobId}] Generating embeddings for bookmark ${bookmarkId}`,
  );

  // Fetch the bookmark with all related data
  const bookmark = await fetchBookmark(bookmarkId);
  if (!bookmark) {
    throw new Error(
      `[embeddings][${jobId}] Bookmark ${bookmarkId} not found`,
    );
  }

  // Build the text to embed
  const embeddingText = await buildEmbeddingText(bookmark);
  if (!embeddingText) {
    logger.info(
      `[embeddings][${jobId}] No content found for bookmark ${bookmarkId}, skipping embedding generation`,
    );
    return;
  }

  logger.debug(
    `[embeddings][${jobId}] Embedding text length: ${embeddingText.length} characters`,
  );

  // Generate embeddings using the inference client
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

  const embedding = embeddingResponse.embeddings[0];
  logger.info(
    `[embeddings][${jobId}] Generated embedding with ${embedding.length} dimensions`,
  );

  // Store the embedding in the database
  const embeddingBuffer = embeddingToBuffer(embedding);

  await db
    .insert(bookmarkEmbeddings)
    .values({
      bookmarkId: bookmark.id,
      userId: bookmark.userId,
      embedding: embeddingBuffer,
      embeddingModel: serverConfig.embedding.textModel,
      vectorDimension: embedding.length,
    })
    .onConflictDoUpdate({
      target: bookmarkEmbeddings.bookmarkId,
      set: {
        embedding: embeddingBuffer,
        embeddingModel: serverConfig.embedding.textModel,
        vectorDimension: embedding.length,
        createdAt: new Date(),
      },
    });

  logger.info(
    `[embeddings][${jobId}] Stored embedding for bookmark ${bookmarkId}`,
  );

  // Trigger embeddings indexing
  await triggerEmbeddingsIndexing(bookmarkId, {
    priority: job.priority,
    groupId: bookmark.userId,
  });

  logger.info(
    `[embeddings][${jobId}] Triggered embeddings indexing for bookmark ${bookmarkId}`,
  );
}
