import { and, eq } from "drizzle-orm";

import type { DB } from "@karakeep/db";
import {
  bookmarkLinks,
  bookmarks,
  summaryProcessing,
} from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { zSummaryErrorCode } from "@karakeep/shared/types/sourceSummary";
import type { SummaryProcessingStatus } from "@karakeep/shared/types/sourceSummary";

import { OpenAIQueue } from "../queues";
import {
  beginSummaryAttempt,
  currentSummaryAttempt,
  failSummaryAttempt,
  invalidateChangedSummarySource,
  getPublishedReaderSummary,
} from "./summaryState";
import type { SummaryAttempt } from "./summaryState";

export const SUMMARY_RECOVERY_DELAYS = [60_000, 300_000];

async function enqueueAttempt(
  db: DB,
  attempt: SummaryAttempt,
  automatic: boolean,
  delayMs = 0,
) {
  try {
    await OpenAIQueue.enqueue(
      {
        bookmarkId: attempt.bookmarkId,
        type: "summarize",
        summaryGeneration: attempt.generation,
        summaryManual: !automatic,
      },
      {
        idempotencyKey: `summary:${attempt.generation}`,
        groupId: attempt.userId,
        delayMs,
      },
    );
  } catch {
    failSummaryAttempt(db, attempt, "provider");
    throw new Error("Unable to queue summary processing");
  }
}

// Ownership must be verified before either reading status or registering a run.
export function getSummaryProcessingStatus(
  db: DB,
  bookmarkId: string,
  userId: string,
): SummaryProcessingStatus {
  invalidateChangedSummarySource(db, bookmarkId, userId);
  const state = db
    .select()
    .from(summaryProcessing)
    .where(
      and(
        eq(summaryProcessing.bookmarkId, bookmarkId),
        eq(summaryProcessing.userId, userId),
      ),
    )
    .get();
  const safeError = (value: string | null) =>
    zSummaryErrorCode.safeParse(value).data ?? null;
  return {
    enabled: serverConfig.summary.provider === "notebooklm",
    processing:
      state &&
      (state.status !== "success" ||
        getPublishedReaderSummary(db, bookmarkId, userId))
        ? {
            status: state.status,
            stage: state.status === "pending" ? state.stage : state.status,
            provider: state.provider,
            errorCode: safeError(state.errorCode),
            notebookErrorCode: safeError(state.notebookErrorCode),
            hermesErrorCode: safeError(state.hermesErrorCode),
            retryCount: state.retryCount,
            nextRetryAt: state.nextRetryAt,
            startedAt: state.startedAt,
            generatedAt: state.generatedAt,
            taggingStatus: state.taggingStatus,
            taggingErrorCode:
              state.taggingErrorCode === "invalid_response"
                ? "invalid_response"
                : safeError(state.taggingErrorCode),
          }
        : null,
  };
}

export async function requestSourceSummary(
  db: DB,
  bookmarkId: string,
  userId: string,
) {
  const result = db.transaction((tx) => {
    const bookmark = tx
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)))
      .get();
    const link = tx
      .select()
      .from(bookmarkLinks)
      .where(eq(bookmarkLinks.id, bookmarkId))
      .get();
    if (!bookmark || !link) throw new Error("Summary source not found");
    const previous = tx
      .select()
      .from(summaryProcessing)
      .where(eq(summaryProcessing.bookmarkId, bookmarkId))
      .get();
    if (
      previous?.status === "pending" &&
      previous.stage !== "retry_wait" &&
      currentSummaryAttempt(tx, bookmarkId, userId, previous.generation)
    )
      return null;
    const host = new URL(link.url).hostname.toLowerCase().replace(/\.$/, "");
    return beginSummaryAttempt(
      tx,
      bookmarkId,
      userId,
      host === "youtu.be" ||
        host === "www.youtu.be" ||
        host === "youtube.com" ||
        host.endsWith(".youtube.com")
        ? "youtube"
        : "article",
    );
  });
  if (result) await enqueueAttempt(db, result, false);
  return { queued: !!result };
}

export async function scheduleSummaryRecovery(
  db: DB,
  failed: SummaryAttempt,
  automatic: boolean,
) {
  const next = db.transaction((tx) => {
    const state = tx
      .select()
      .from(summaryProcessing)
      .where(
        and(
          eq(summaryProcessing.bookmarkId, failed.bookmarkId),
          eq(summaryProcessing.generation, failed.generation),
          eq(summaryProcessing.userId, failed.userId),
        ),
      )
      .get();
    if (
      !state ||
      state.status !== "failure" ||
      !["timeout", "provider"].includes(state.errorCode ?? "") ||
      !currentSummaryAttempt(
        tx,
        failed.bookmarkId,
        failed.userId,
        failed.generation,
      )
    )
      return null;
    const delayMs = SUMMARY_RECOVERY_DELAYS[state.retryCount];
    if (delayMs === undefined) return null;
    const attempt = beginSummaryAttempt(
      tx,
      failed.bookmarkId,
      failed.userId,
      failed.sourceType,
    );
    tx.update(summaryProcessing)
      .set({
        stage: "retry_wait",
        retryCount: state.retryCount + 1,
        nextRetryAt: new Date(Date.now() + delayMs),
        notebookErrorCode: state.notebookErrorCode,
        hermesErrorCode: state.hermesErrorCode,
      })
      .where(eq(summaryProcessing.bookmarkId, failed.bookmarkId))
      .run();
    return { attempt, delayMs };
  });
  if (!next) return false;
  await enqueueAttempt(db, next.attempt, automatic, next.delayMs);
  return true;
}
