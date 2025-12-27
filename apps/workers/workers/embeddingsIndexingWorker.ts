import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";

import type { ZEmbeddingsIndexingRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import { bookmarkEmbeddings } from "@karakeep/db/schema";
import {
  EmbeddingsIndexingQueue,
  zEmbeddingsIndexingRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import {
  BookmarkVectorDocument,
  getVectorStoreClient,
  VectorStoreClient,
} from "@karakeep/shared/vectorStore";

export class EmbeddingsIndexingWorker {
  static async build() {
    logger.info("Starting embeddings indexing worker ...");
    const worker =
      (await getQueueClient())!.createRunner<ZEmbeddingsIndexingRequest>(
        EmbeddingsIndexingQueue,
        {
          run: runEmbeddingsIndexing,
          onComplete: (job) => {
            workerStatsCounter.labels("embeddings_indexing", "completed").inc();
            const jobId = job.id;
            logger.info(`[embeddings-indexing][${jobId}] Completed successfully`);
            return Promise.resolve();
          },
          onError: (job) => {
            workerStatsCounter.labels("embeddings_indexing", "failed").inc();
            if (job.numRetriesLeft == 0) {
              workerStatsCounter
                .labels("embeddings_indexing", "failed_permanent")
                .inc();
            }
            const jobId = job.id;
            logger.error(
              `[embeddings-indexing][${jobId}] embeddings indexing job failed: ${job.error}\n${job.error.stack}`,
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

async function runIndex(
  vectorStoreClient: VectorStoreClient,
  bookmarkId: string,
) {
  // Fetch the embedding from the database
  const embeddingRecord = await db.query.bookmarkEmbeddings.findFirst({
    where: eq(bookmarkEmbeddings.bookmarkId, bookmarkId),
  });

  if (!embeddingRecord) {
    throw new Error(
      `Embedding for bookmark ${bookmarkId} not found in database`,
    );
  }

  // Convert the buffer back to an array
  const vector = bufferToEmbedding(embeddingRecord.embedding);

  const document: BookmarkVectorDocument = {
    id: embeddingRecord.bookmarkId,
    userId: embeddingRecord.userId,
    vector,
  };

  await vectorStoreClient.addVectors([document]);
}

async function runDelete(
  vectorStoreClient: VectorStoreClient,
  bookmarkId: string,
) {
  await vectorStoreClient.deleteVectors([bookmarkId]);
}

async function runEmbeddingsIndexing(
  job: DequeuedJob<ZEmbeddingsIndexingRequest>,
) {
  const jobId = job.id;

  const request = zEmbeddingsIndexingRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(
      `[embeddings-indexing][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
  }

  const vectorStoreClient = await getVectorStoreClient();
  if (!vectorStoreClient) {
    logger.debug(
      `[embeddings-indexing][${jobId}] Vector store is not configured, nothing to do now`,
    );
    return;
  }

  const bookmarkId = request.data.bookmarkId;
  logger.info(
    `[embeddings-indexing][${jobId}] Attempting to ${request.data.type} embeddings for bookmark ${bookmarkId}`,
  );

  switch (request.data.type) {
    case "index": {
      await runIndex(vectorStoreClient, bookmarkId);
      break;
    }
    case "delete": {
      await runDelete(vectorStoreClient, bookmarkId);
      break;
    }
  }
}
