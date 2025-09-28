import { and, eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";

import { db } from "@karakeep/db";
import { importSessionBookmarks, importSessions } from "@karakeep/db/schema";
import {
  AssetPreprocessingQueue,
  ImportSessionQueue,
  LinkCrawlerQueue,
  OpenAIQueue,
  ZImportSessionRequest,
  zImportSessionRequestSchema,
} from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import {
  DequeuedJob,
  EnqueueOptions,
  getQueueClient,
} from "@karakeep/shared/queueing";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

export class ImportSessionWorker {
  static async build() {
    logger.info("Starting import session worker ...");
    const worker =
      (await getQueueClient())!.createRunner<ZImportSessionRequest>(
        ImportSessionQueue,
        {
          run: runImportSession,
          onComplete: async (job) => {
            workerStatsCounter.labels("import_session", "completed").inc();
            const jobId = job.id;
            logger.info(`[import_session][${jobId}] Completed successfully`);
            return Promise.resolve();
          },
          onError: async (job) => {
            workerStatsCounter.labels("import_session", "failed").inc();
            const jobId = job.id;
            logger.error(
              `[import_session][${jobId}] import session job failed: ${job.error}\n${job.error.stack}`,
            );
            return Promise.resolve();
          },
        },
        {
          concurrency: 2,
          pollIntervalMs: 5000, // Check every 5 seconds
          timeoutSecs: 300, // 5 minute timeout per iteration
          validator: zImportSessionRequestSchema,
        },
      );

    return worker;
  }
}

async function runImportSession(job: DequeuedJob<ZImportSessionRequest>) {
  const jobId = job.id;
  const { importSessionId } = job.data;

  logger.info(
    `[import_session][${jobId}] Starting processing import session "${importSessionId}"`,
  );

  // Get the import session details
  const session = await db.query.importSessions.findFirst({
    where: eq(importSessions.id, importSessionId),
  });

  if (!session) {
    logger.error(
      `[import_session][${jobId}] Import session not found: ${importSessionId}`,
    );
    return;
  }

  if (session.status === "completed" || session.status === "failed") {
    logger.info(
      `[import_session][${jobId}] Import session already completed: ${importSessionId}`,
    );
    return;
  }

  // Update session status to in_progress
  await db
    .update(importSessions)
    .set({
      status: "in_progress",
      modifiedAt: new Date(),
    })
    .where(eq(importSessions.id, importSessionId));

  try {
    // Get one pending bookmark from the session
    const pendingBookmark = await db.query.importSessionBookmarks.findFirst({
      where: and(
        eq(importSessionBookmarks.importSessionId, importSessionId),
        eq(importSessionBookmarks.status, "pending"),
      ),
      with: {
        bookmark: {
          with: {
            link: true,
            text: true,
            asset: true,
          },
        },
      },
    });

    if (!pendingBookmark) {
      // No more pending bookmarks, check if session is complete
      const remainingBookmarks = await db.query.importSessionBookmarks.findMany(
        {
          where: and(
            eq(importSessionBookmarks.importSessionId, importSessionId),
            eq(importSessionBookmarks.status, "processing"),
          ),
        },
      );

      if (remainingBookmarks.length === 0) {
        // All bookmarks are processed, mark session as completed
        await db
          .update(importSessions)
          .set({
            status: "completed",
            message: "All bookmarks processed successfully",
            modifiedAt: new Date(),
          })
          .where(eq(importSessions.id, importSessionId));

        logger.info(
          `[import_session][${jobId}] Import session completed: ${importSessionId}`,
        );
      } else {
        // Some bookmarks are still processing, re-enqueue the session job
        await ImportSessionQueue.enqueue(
          { importSessionId },
          {
            delayMs: 10000, // Wait 10 seconds before checking again
          },
        );
      }
      return;
    }

    // Mark bookmark as processing
    await db
      .update(importSessionBookmarks)
      .set({
        status: "processing",
      })
      .where(eq(importSessionBookmarks.id, pendingBookmark.id));

    logger.info(
      `[import_session][${jobId}] Processing bookmark: ${pendingBookmark.bookmarkId}`,
    );

    // Process the bookmark based on its type
    const enqueueOpts: EnqueueOptions = {
      priority: 10, // Lower priority than normal bookmarks
    };

    try {
      switch (pendingBookmark.bookmark.type) {
        case BookmarkTypes.LINK: {
          if (pendingBookmark.bookmark.link) {
            await LinkCrawlerQueue.enqueue(
              {
                bookmarkId: pendingBookmark.bookmarkId,
                runInference: true,
              },
              enqueueOpts,
            );
          }
          break;
        }
        case BookmarkTypes.TEXT: {
          if (pendingBookmark.bookmark.text) {
            await OpenAIQueue.enqueue(
              {
                bookmarkId: pendingBookmark.bookmarkId,
                type: "tag",
              },
              enqueueOpts,
            );
          }
          break;
        }
        case BookmarkTypes.ASSET: {
          if (pendingBookmark.bookmark.asset) {
            await AssetPreprocessingQueue.enqueue(
              {
                bookmarkId: pendingBookmark.bookmarkId,
                fixMode: false,
              },
              enqueueOpts,
            );
          }
          break;
        }
      }

      // Mark bookmark as completed
      await db
        .update(importSessionBookmarks)
        .set({
          status: "completed",
        })
        .where(eq(importSessionBookmarks.id, pendingBookmark.id));

      logger.info(
        `[import_session][${jobId}] Bookmark processed successfully: ${pendingBookmark.bookmarkId}`,
      );
    } catch (error) {
      // Mark bookmark as failed
      await db
        .update(importSessionBookmarks)
        .set({
          status: "failed",
        })
        .where(eq(importSessionBookmarks.id, pendingBookmark.id));

      logger.error(
        `[import_session][${jobId}] Failed to process bookmark ${pendingBookmark.bookmarkId}: ${error}`,
      );
    }

    // Re-enqueue the session job to process the next bookmark
    await ImportSessionQueue.enqueue(
      { importSessionId },
      {
        delayMs: 1000, // Small delay to avoid overwhelming the system
      },
    );
  } catch (error) {
    logger.error(
      `[import_session][${jobId}] Error processing import session ${importSessionId}: ${error}`,
    );

    // Mark session as failed
    await db
      .update(importSessions)
      .set({
        status: "failed",
        message: `Processing failed: ${error instanceof Error ? error.message : String(error)}`,
        modifiedAt: new Date(),
      })
      .where(eq(importSessions.id, importSessionId));

    throw error;
  }
}
