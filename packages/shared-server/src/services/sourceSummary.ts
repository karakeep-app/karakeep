import { setTimeout as delay } from "node:timers/promises";
import { and, eq } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkLinks,
  bookmarks,
  customPrompts,
  summaryProcessing,
  users,
  webhooksTable,
} from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import type { EnqueueOptions } from "@karakeep/shared/queueing";
import { htmlToPlainText } from "@karakeep/shared/utils/htmlUtils";

import { deleteAsset, newAssetId, readAsset, saveAsset } from "../assetdb";
import { OpenAIQueue, triggerSearchReindex, WebhookQueue } from "../queues";
import { QuotaService } from "./quotaService";
import { scheduleSummaryRecovery } from "./summaryRecovery";
import { enqueueSummaryTags } from "./summaryTags";
import {
  generateSourceSummary,
  summaryInstructions,
  SummaryProviderError,
} from "./summaryProviders";
import {
  beginSummaryAttempt,
  currentSummaryAttempt,
  failSummaryAttempt,
  invalidateChangedSummarySource,
  publishSummary,
  recordSummaryProgress,
} from "./summaryState";

export function summarySourceType(url: string): "article" | "youtube" {
  const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  return host === "youtu.be" ||
    host === "www.youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com")
    ? "youtube"
    : "article";
}

export async function enqueueSourceSummary(
  db: DB,
  bookmarkId: string,
  opts?: EnqueueOptions,
  reuseCurrent = false,
) {
  if (serverConfig.summary.provider !== "notebooklm")
    return OpenAIQueue.enqueue({ bookmarkId, type: "summarize" }, opts);
  if (!serverConfig.inference.enableAutoSummarization) return;
  const link = await db.query.bookmarkLinks.findFirst({
    where: eq(bookmarkLinks.id, bookmarkId),
  });
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
  });
  if (!link || !bookmark) return;
  const user = await db.query.users.findFirst({
    where: eq(users.id, bookmark.userId),
  });
  if (user?.autoSummarizationEnabled === false) return;
  if (reuseCurrent) {
    const previous = await db.query.summaryProcessing.findFirst({
      where: eq(summaryProcessing.bookmarkId, bookmarkId),
    });
    if (
      previous &&
      previous.status !== "failure" &&
      currentSummaryAttempt(
        db,
        bookmarkId,
        bookmark.userId,
        previous.generation,
      )
    )
      return;
  }
  const attempt = beginSummaryAttempt(
    db,
    bookmarkId,
    bookmark.userId,
    summarySourceType(link.url),
  );
  return OpenAIQueue.enqueue(
    { bookmarkId, type: "summarize", summaryGeneration: attempt.generation },
    { ...opts, idempotencyKey: `summary:${attempt.generation}` },
  );
}

export interface SourceSummaryOptions {
  generation?: string;
  signal?: AbortSignal;
  automatic?: boolean;
}

// Receives an authorized owner ID from the caller and re-checks it at every write.
export async function executeSourceSummary(
  db: DB,
  bookmarkId: string,
  userId: string,
  options: SourceSummaryOptions = {},
  generate = generateSourceSummary,
) {
  const bookmark = await db.query.bookmarks.findFirst({
    where: and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)),
  });
  const link = await db.query.bookmarkLinks.findFirst({
    where: eq(bookmarkLinks.id, bookmarkId),
  });
  if (!bookmark || !link) throw new SummaryProviderError("no_text");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (
    options.automatic &&
    (!serverConfig.inference.enableAutoSummarization ||
      user?.autoSummarizationEnabled === false)
  ) {
    if (options.generation) {
      const attempt = currentSummaryAttempt(
        db,
        bookmarkId,
        userId,
        options.generation,
      );
      if (attempt) failSummaryAttempt(db, attempt, "cancelled");
    }
    return { summary: bookmark.summary, published: false };
  }
  invalidateChangedSummarySource(db, bookmarkId, userId);
  const previous = await db.query.summaryProcessing.findFirst({
    where: eq(summaryProcessing.bookmarkId, bookmarkId),
  });
  // Legacy queue entries have no generation. Never let one supersede a registered run.
  if (options.automatic && !options.generation && previous)
    return { summary: bookmark.summary, published: false };
  const attempt = options.generation
    ? currentSummaryAttempt(db, bookmarkId, userId, options.generation)
    : beginSummaryAttempt(db, bookmarkId, userId, summarySourceType(link.url));
  if (!attempt) return { summary: bookmark.summary, published: false };
  if (options.generation && previous?.status === "success")
    return { summary: bookmark.summary, published: false };
  if (options.generation && previous?.status === "failure")
    throw new SummaryProviderError();
  const prompts = await db.query.customPrompts.findMany({
    where: and(
      eq(customPrompts.userId, userId),
      eq(customPrompts.appliesTo, "summary"),
    ),
  });
  let transcriptAssetId: string | undefined;
  let source: string | undefined;
  try {
    if (attempt.sourceType === "article") {
      let html = link.htmlContent;
      if (link.contentAssetId) {
        try {
          html = (
            await readAsset({ userId, assetId: link.contentAssetId })
          ).asset.toString("utf8");
        } catch {
          // The remote URL can still import successfully when a local asset is unavailable.
        }
      }
      source = html ? htmlToPlainText(html) : undefined;
    } else if (
      previous?.sourceUrl === attempt.sourceUrl &&
      previous.sourceVersion === attempt.sourceVersion &&
      previous.transcriptAssetId
    ) {
      try {
        source = (
          await readAsset({ userId, assetId: previous.transcriptAssetId })
        ).asset.toString("utf8");
        transcriptAssetId = previous.transcriptAssetId;
      } catch {
        /* Unavailable cached text does not prevent a new URL import. */
      }
    }
    const result = await generate({
      attempt,
      text: source,
      instructions: summaryInstructions(prompts.map((p) => p.text)),
      signal: options.signal,
      onProgress: async (progress) => {
        if (!recordSummaryProgress(db, attempt, progress))
          throw new SummaryProviderError("source_changed");
      },
      onSource: async (text, notebookId) => {
        options.signal?.throwIfAborted();
        const assetId = newAssetId();
        const data = Buffer.from(text, "utf8");
        const quotaApproved = await QuotaService.checkStorageQuota(
          db,
          userId,
          data.byteLength,
        );
        await saveAsset({
          userId,
          assetId,
          asset: data,
          metadata: {
            contentType: "text/plain",
            fileName: "summary-source.txt",
          },
          quotaApproved,
        });
        let attached = false;
        try {
          attached = db.transaction((tx) => {
            const current = currentSummaryAttempt(
              tx,
              bookmarkId,
              userId,
              attempt.generation,
            );
            if (!current) return false;
            tx.insert(assets)
              .values({
                id: assetId,
                userId,
                bookmarkId,
                assetType: AssetTypes.SUMMARY_SOURCE,
                contentType: "text/plain",
                fileName: "summary-source.txt",
                size: data.byteLength,
              })
              .run();
            tx.update(summaryProcessing)
              .set({
                transcriptAssetId: assetId,
                notebookId,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(summaryProcessing.bookmarkId, bookmarkId),
                  eq(summaryProcessing.generation, attempt.generation),
                ),
              )
              .run();
            return true;
          });
        } finally {
          if (!attached) await deleteAsset({ userId, assetId });
        }
        if (!attached) throw new SummaryProviderError("source_changed");
        transcriptAssetId = assetId;
      },
    });
    options.signal?.throwIfAborted();
    const published = publishSummary(db, attempt, {
      ...result,
      transcriptAssetId,
      tagging:
        serverConfig.summary.autoTagsEnabled &&
        user?.autoTaggingEnabled !== false,
    });
    if (!published) return { summary: bookmark.summary, published: false };
    await enqueueSummaryTags(db, bookmarkId, userId, attempt.generation);
    await triggerSearchReindex(bookmarkId, { groupId: userId });
    const webhook = await db.query.webhooksTable.findFirst({
      where: eq(webhooksTable.userId, userId),
    });
    if (webhook)
      await WebhookQueue.enqueue(
        { bookmarkId, userId, operation: "edited" },
        { groupId: userId, idempotencyKey: `summary:${attempt.generation}` },
      );
    return { summary: result.markdown, published: true };
  } catch (error) {
    const code = options.signal?.aborted
      ? "cancelled"
      : error instanceof SummaryProviderError
        ? error.code
        : "provider";
    if (failSummaryAttempt(db, attempt, code) && !options.signal?.aborted) {
      await scheduleSummaryRecovery(db, attempt, !!options.automatic);
    }
    throw new SummaryProviderError(code);
  }
}

export async function waitForSourceSummary<T>(
  pending: Promise<T>,
  seconds: number,
): Promise<T> {
  const controller = new AbortController();
  try {
    return await Promise.race([
      pending,
      delay(seconds * 1000, undefined, {
        signal: controller.signal,
        ref: false,
      }).then(() => {
        throw new SummaryProviderError("timeout");
      }),
    ]);
  } finally {
    controller.abort();
  }
}
