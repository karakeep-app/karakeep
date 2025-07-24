import { eq } from "drizzle-orm";
import { DequeuedJob, Runner } from "liteque";

import type { ZSearchIndexingRequest } from "@karakeep/shared/queues";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import {
  SearchIndexingQueue,
  zSearchIndexingRequestSchema,
} from "@karakeep/shared/queues";
import { getSearchIdxClient } from "@karakeep/shared/search";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

export class SearchIndexingWorker {
  static build() {
    logger.info("Starting search indexing worker ...");
    const worker = new Runner<ZSearchIndexingRequest>(
      SearchIndexingQueue,
      {
        run: runSearchIndexing,
        onComplete: (job) => {
          const jobId = job.id;
          logger.info(`[search][${jobId}] Completed successfully`);
          return Promise.resolve();
        },
        onError: (job) => {
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

async function ensureTaskSuccess(
  searchClient: NonNullable<Awaited<ReturnType<typeof getSearchIdxClient>>>,
  taskUid: number,
) {
  const task = await searchClient.waitForTask(taskUid);
  if (task.error) {
    throw new Error(`Search task failed: ${task.error.message}`);
  }
}

async function runIndex(
  searchClient: NonNullable<Awaited<ReturnType<typeof getSearchIdxClient>>>,
  bookmarkId: string,
) {
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

  const task = await searchClient.addDocuments(
    [
      {
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
          : undefined),
        ...(bookmark.asset
          ? {
              content: bookmark.asset.content,
              metadata: bookmark.asset.metadata,
            }
          : undefined),
        ...(bookmark.text ? { content: bookmark.text.text } : undefined),
        note: bookmark.note,
        summary: bookmark.summary,
        title: bookmark.title,
        createdAt: bookmark.createdAt.toISOString(),
        tags: bookmark.tagsOnBookmarks.map((t) => t.tag.name),
      },
    ],
    {
      primaryKey: "id",
    },
  );
  await ensureTaskSuccess(searchClient, task.taskUid);
}

async function runDelete(
  searchClient: NonNullable<Awaited<ReturnType<typeof getSearchIdxClient>>>,
  bookmarkId: string,
) {
  const task = await searchClient.deleteDocument(bookmarkId);
  await ensureTaskSuccess(searchClient, task.taskUid);
}

async function runSearchIndexing(job: DequeuedJob<ZSearchIndexingRequest>) {
  const jobId = job.id;

  const request = zSearchIndexingRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(
      `[search][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
  }

  const searchClient = await getSearchIdxClient();
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
