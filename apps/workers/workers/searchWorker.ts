import { eq } from "drizzle-orm";
import { DequeuedJob, Runner } from "liteque";
import { workerStatsCounter } from "metrics";

import type { ZSearchIndexingRequest } from "@karakeep/shared/queues";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import {
  SearchIndexingQueue,
  zSearchIndexingRequestSchema,
} from "@karakeep/shared/queues";
import {
  BookmarkSearchDocument,
  getSearchClient,
  SearchIndexClient,
} from "@karakeep/shared/search";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

export class SearchIndexingWorker {
  static build() {
    logger.info("Starting search indexing worker ...");
    const worker = new Runner<ZSearchIndexingRequest>(
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
        timeoutSecs: 30,
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
  await searchClient.deleteDocument(bookmarkId);
}

async function runSearchIndexing(job: DequeuedJob<ZSearchIndexingRequest>) {
  const jobId = job.id;

  const request = zSearchIndexingRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(
      `[search][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
  }

  const searchClient = await getSearchClient();
  if (!searchClient) {
    logger.debug(
      `[search][${jobId}] Search is not configured, nothing to do now`,
    );
    return;
  }

  const bookmarkId = request.data.bookmarkId;
  logger.info(
    `[search][${jobId}] Attempting to index bookmark with id ${bookmarkId} ...`,
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
}
