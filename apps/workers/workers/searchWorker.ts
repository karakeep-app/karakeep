import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";

import type { ZSearchIndexingRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { bookmarkEmbeddings, bookmarks } from "@karakeep/db/schema";
import {
  SearchIndexingQueue,
  zSearchIndexingRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import {
  BookmarkSearchDocument,
  getSearchClient,
  SearchIndexClient,
} from "@karakeep/shared/search";
import {
  BookmarkVectorDocument,
  getVectorStoreClient,
  VectorStoreClient,
} from "@karakeep/shared/vectorStore";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

export class SearchIndexingWorker {
  static async build() {
    logger.info("Starting search indexing worker ...");
    const worker =
      (await getQueueClient())!.createRunner<ZSearchIndexingRequest>(
        SearchIndexingQueue,
        {
          run: runSearchIndexing,
          onComplete: (job) => {
            workerStatsCounter.labels("search", "completed").inc();
            const jobId = job.id;
            logger.info(`[search][${jobId}] Completed successfully`);
            return Promise.resolve();
          },
          onError: (job) => {
            workerStatsCounter.labels("search", "failed").inc();
            if (job.numRetriesLeft == 0) {
              workerStatsCounter.labels("search", "failed_permanent").inc();
            }
            const jobId = job.id;
            logger.error(
              `[search][${jobId}] search job failed: ${job.error}\n${job.error.stack}`,
            );
            return Promise.resolve();
          },
        },
        {
          concurrency: serverConfig.search.numWorkers,
          pollIntervalMs: 1000,
          timeoutSecs: serverConfig.search.jobTimeoutSec,
        },
      );

    return worker;
  }
}

async function runIndex(searchClient: SearchIndexClient, bookmarkId: string) {
  const bookmark = await db.query.bookmarks.findFirst({
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

  if (!bookmark) {
    throw new Error(`Bookmark ${bookmarkId} not found`);
  }

  const document: BookmarkSearchDocument = {
    id: bookmark.id,
    userId: bookmark.userId,
    ...(bookmark.link
      ? {
          url: bookmark.link.url,
          linkTitle: bookmark.link.title,
          description: bookmark.link.description,
          content: await Bookmark.getBookmarkPlainTextContent(
            bookmark.link,
            bookmark.userId,
          ),
          publisher: bookmark.link.publisher,
          author: bookmark.link.author,
          datePublished: bookmark.link.datePublished,
          dateModified: bookmark.link.dateModified,
        }
      : {}),
    ...(bookmark.asset
      ? {
          content: bookmark.asset.content,
          metadata: bookmark.asset.metadata,
        }
      : {}),
    ...(bookmark.text ? { content: bookmark.text.text } : {}),
    note: bookmark.note,
    summary: bookmark.summary,
    title: bookmark.title,
    createdAt: bookmark.createdAt.toISOString(),
    tags: bookmark.tagsOnBookmarks.map((t) => t.tag.name),
  };

  await searchClient.addDocuments([document]);
}

async function runDelete(searchClient: SearchIndexClient, bookmarkId: string) {
  await searchClient.deleteDocuments([bookmarkId]);
}

/**
 * Converts a Buffer back to a number array
 */
function bufferToEmbedding(buffer: Buffer): number[] {
  const float32Array = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return Array.from(float32Array);
}

async function runEmbeddingIndex(
  vectorStoreClient: VectorStoreClient,
  bookmarkId: string,
  jobId: string,
) {
  // Fetch the embedding from the database
  const embeddingRecord = await db.query.bookmarkEmbeddings.findFirst({
    where: eq(bookmarkEmbeddings.bookmarkId, bookmarkId),
  });

  if (!embeddingRecord) {
    logger.warn(
      `[search][${jobId}] Embedding for bookmark ${bookmarkId} not found in database, skipping vector indexing`,
    );
    return;
  }

  // Convert the buffer back to an array
  const vector = bufferToEmbedding(embeddingRecord.embedding);

  const document: BookmarkVectorDocument = {
    id: embeddingRecord.bookmarkId,
    userId: embeddingRecord.userId,
    vector,
  };

  await vectorStoreClient.addVectors([document]);
  logger.info(
    `[search][${jobId}] Indexed embedding for bookmark ${bookmarkId}`,
  );
}

async function runEmbeddingDelete(
  vectorStoreClient: VectorStoreClient,
  bookmarkId: string,
  jobId: string,
) {
  await vectorStoreClient.deleteVectors([bookmarkId]);
  logger.info(
    `[search][${jobId}] Deleted embedding for bookmark ${bookmarkId}`,
  );
}

async function runSearchIndexing(job: DequeuedJob<ZSearchIndexingRequest>) {
  const jobId = job.id;

  const request = zSearchIndexingRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(
      `[search][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
  }

  const bookmarkId = request.data.bookmarkId;
  const indexEmbedding = request.data.indexEmbedding ?? false;

  // Handle full-text search indexing
  const searchClient = await getSearchClient();
  if (searchClient) {
    logger.info(
      `[search][${jobId}] Attempting to ${request.data.type} bookmark with id ${bookmarkId} ...`,
    );

    switch (request.data.type) {
      case "index": {
        await runIndex(searchClient, bookmarkId);
        break;
      }
      case "delete": {
        await runDelete(searchClient, bookmarkId);
        break;
      }
    }
  } else {
    logger.debug(
      `[search][${jobId}] Search is not configured, skipping full-text indexing`,
    );
  }

  // Handle vector store indexing (only if indexEmbedding is true)
  if (indexEmbedding) {
    const vectorStoreClient = await getVectorStoreClient();
    if (vectorStoreClient) {
      logger.info(
        `[search][${jobId}] Attempting to ${request.data.type} embedding for bookmark ${bookmarkId} ...`,
      );

      switch (request.data.type) {
        case "index": {
          await runEmbeddingIndex(vectorStoreClient, bookmarkId, jobId);
          break;
        }
        case "delete": {
          await runEmbeddingDelete(vectorStoreClient, bookmarkId, jobId);
          break;
        }
      }
    } else {
      logger.debug(
        `[search][${jobId}] Vector store is not configured, skipping embedding indexing`,
      );
    }
  }
}
