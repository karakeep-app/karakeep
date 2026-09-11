import { and, eq } from "drizzle-orm";
import { getBookmarkDomain } from "network";

import { db } from "@karakeep/db";
import { bookmarks, customPrompts, users } from "@karakeep/db/schema";
import {
  addLogFields,
  setSpanAttributes,
  triggerSearchReindex,
  ZOpenAIRequest,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClient } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { buildSummaryPrompt } from "@karakeep/shared/prompts.server";
import { DequeuedJob } from "@karakeep/shared/queueing";
import { buildSummarizationInput } from "@karakeep/shared/summarization";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

async function fetchBookmarkDetailsForSummary(bookmarkId: string) {
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: { id: true, userId: true, type: true },
    with: {
      link: {
        columns: {
          title: true,
          description: true,
          htmlContent: true,
          contentAssetId: true,
          crawlStatusCode: true,
          publisher: true,
          author: true,
          url: true,
        },
      },
      text: {
        columns: {
          text: true,
        },
      },
      asset: {
        columns: {
          content: true,
          fileName: true,
        },
      },
    },
  });

  if (!bookmark) {
    throw new Error(`Bookmark with id ${bookmarkId} not found`);
  }
  return bookmark;
}

export async function runSummarization(
  bookmarkId: string,
  job: DequeuedJob<ZOpenAIRequest>,
  inferenceClient: InferenceClient,
) {
  if (!serverConfig.inference.enableAutoSummarization) {
    logger.debug(
      `[inference][${job.id}] Skipping summarization job for bookmark with id "${bookmarkId}" because it's disabled in the config.`,
    );
    return;
  }
  const jobId = job.id;

  logger.info(
    `[inference][${jobId}] Starting a summary job for bookmark with id "${bookmarkId}"`,
  );

  const bookmarkData = await fetchBookmarkDetailsForSummary(bookmarkId);

  // Check user-level preference
  const userSettings = await db.query.users.findFirst({
    where: eq(users.id, bookmarkData.userId),
    columns: {
      autoSummarizationEnabled: true,
      inferredTagLang: true,
    },
  });

  setSpanAttributes({
    "user.id": bookmarkData.userId,
    "bookmark.id": bookmarkData.id,
    "inference.type": "summarization",
  });
  addLogFields<"inferenceWorker.run">({
    "user.id": bookmarkData.userId,
    "bookmark.url": bookmarkData.link?.url,
    "bookmark.domain": getBookmarkDomain(bookmarkData.link?.url),
    "bookmark.content_type": bookmarkData.type,
    "crawler.status_code": bookmarkData.link?.crawlStatusCode ?? undefined,
    "inference.model": serverConfig.inference.textModel,
  });

  if (userSettings?.autoSummarizationEnabled === false) {
    logger.debug(
      `[inference][${jobId}] Skipping summarization job for bookmark with id "${bookmarkId}" because user has disabled auto-summarization.`,
    );
    return;
  }

  // Extracting the plain text content of a link hits the asset store, so it's
  // only resolved for the bookmark type that needs it.
  const linkPlainTextContent =
    bookmarkData.type === BookmarkTypes.LINK && bookmarkData.link
      ? ((await Bookmark.getBookmarkPlainTextContent(
          bookmarkData.link,
          bookmarkData.userId,
        )) ?? "")
      : "";

  const textToSummarize = buildSummarizationInput(
    bookmarkData,
    linkPlainTextContent,
  );

  if (!textToSummarize) {
    logger.info(
      `[inference][${jobId}] No content to summarize for bookmark ${bookmarkId} (type: ${bookmarkData.type}). Skipping summary.`,
    );
    return;
  }

  const prompts = await db.query.customPrompts.findMany({
    where: and(
      eq(customPrompts.userId, bookmarkData.userId),
      eq(customPrompts.appliesTo, "summary"),
    ),
    columns: {
      text: true,
    },
  });

  addLogFields<"inferenceWorker.run">({
    "inference.prompt.custom_count": prompts.length,
  });

  const summaryPrompt = await buildSummaryPrompt(
    userSettings?.inferredTagLang ?? serverConfig.inference.inferredTagLang,
    prompts.map((p) => p.text),
    textToSummarize,
    serverConfig.inference.contextLength,
  );

  addLogFields<"inferenceWorker.run">({
    "inference.prompt.size": Buffer.byteLength(summaryPrompt, "utf8"),
  });

  const summaryResult = await inferenceClient.inferFromText(summaryPrompt, {
    schema: null, // Summaries are typically free-form text
    abortSignal: job.abortSignal,
  });

  if (!summaryResult.response) {
    throw new Error(
      `[inference][${jobId}] Failed to summarize bookmark ${bookmarkId}, empty response from inference client.`,
    );
  }

  addLogFields<"inferenceWorker.run">({
    "inference.summary.size": Buffer.byteLength(summaryResult.response, "utf8"),
    "inference.total_tokens": summaryResult.totalTokens,
  });

  logger.info(
    `[inference][${jobId}] Generated summary for bookmark "${bookmarkId}" using ${summaryResult.totalTokens} tokens.`,
  );

  await db
    .update(bookmarks)
    .set({
      summary: summaryResult.response,
      modifiedAt: new Date(),
    })
    .where(eq(bookmarks.id, bookmarkId));

  await triggerSearchReindex(bookmarkId, {
    priority: job.priority,
    groupId: bookmarkData.userId,
  });
}
