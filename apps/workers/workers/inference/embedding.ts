import { eq } from "drizzle-orm";

import type { ZOpenAIRequest } from "@karakeep/shared-server";
import type { InferenceClient } from "@karakeep/shared/inference";
import { db } from "@karakeep/db";
import { bookmarkEmbeddings, bookmarks } from "@karakeep/db/schema";
import { triggerSearchReindex } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob } from "@karakeep/shared/queueing";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

const MAX_EMBEDDING_TEXT_LENGTH = 8000; // Most embedding models have token limits

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

/**
 * Converts a number array to a Buffer for storage
 */
function embeddingToBuffer(embedding: number[]): Buffer {
  const float32Array = new Float32Array(embedding);
  return Buffer.from(float32Array.buffer);
}

export async function runEmbedding(
  bookmarkId: string,
  job: DequeuedJob<ZOpenAIRequest>,
  inferenceClient: InferenceClient,
) {
  const jobId = job.id;

  logger.info(
    `[inference][${jobId}] Generating embeddings for bookmark ${bookmarkId}`,
  );

  // Fetch the bookmark with all related data
  const bookmark = await fetchBookmark(bookmarkId);
  if (!bookmark) {
    throw new Error(`[inference][${jobId}] Bookmark ${bookmarkId} not found`);
  }

  // Build the text to embed
  const embeddingText = await buildEmbeddingText(bookmark);
  if (!embeddingText) {
    logger.info(
      `[inference][${jobId}] No content found for bookmark ${bookmarkId}, skipping embedding generation`,
    );
    return;
  }

  logger.debug(
    `[inference][${jobId}] Embedding text length: ${embeddingText.length} characters`,
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
      `[inference][${jobId}] No embeddings returned from inference client`,
    );
  }

  const embedding = embeddingResponse.embeddings[0];
  logger.info(
    `[inference][${jobId}] Generated embedding with ${embedding.length} dimensions`,
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
    `[inference][${jobId}] Stored embedding for bookmark ${bookmarkId}`,
  );

  // Trigger search indexing with embedding indexing enabled
  await triggerSearchReindex(
    bookmarkId,
    {
      priority: job.priority,
      groupId: bookmark.userId,
    },
    true, // indexEmbedding
  );

  logger.info(
    `[inference][${jobId}] Triggered embedding indexing for bookmark ${bookmarkId}`,
  );
}
