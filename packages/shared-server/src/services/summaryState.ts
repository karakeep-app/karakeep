import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { DB, KarakeepDBTransaction } from "@karakeep/db";
import type { SummaryErrorCode } from "@karakeep/shared/types/sourceSummary";
export type { SummaryErrorCode } from "@karakeep/shared/types/sourceSummary";
import {
  bookmarkLinks,
  bookmarks,
  summaryProcessing,
} from "@karakeep/db/schema";

type SummaryDB = DB | KarakeepDBTransaction;
type SourceType = "article" | "youtube";
export interface SummaryAttempt {
  bookmarkId: string;
  userId: string;
  generation: string;
  sourceVersion: string;
  sourceUrl: string;
  sourceType: SourceType;
}

export function summaryHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// HTML assets are immutable: changing a stored body must change its asset ID.
// Hash the stored source rather than a reader projection or an earlier summary.
function readSource(db: SummaryDB, bookmarkId: string, userId: string) {
  const row = db
    .select({
      url: bookmarkLinks.url,
      html: bookmarkLinks.htmlContent,
      assetId: bookmarkLinks.contentAssetId,
    })
    .from(bookmarkLinks)
    .innerJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)))
    .get();
  if (!row) return null;
  return {
    url: row.url,
    version: summaryHash(JSON.stringify([row.url, row.html, row.assetId])),
  };
}

function attemptCondition(attempt: SummaryAttempt) {
  return and(
    eq(summaryProcessing.bookmarkId, attempt.bookmarkId),
    eq(summaryProcessing.userId, attempt.userId),
    eq(summaryProcessing.generation, attempt.generation),
    eq(summaryProcessing.sourceVersion, attempt.sourceVersion),
    eq(summaryProcessing.status, "pending"),
  );
}

export function beginSummaryAttempt(
  db: SummaryDB,
  bookmarkId: string,
  userId: string,
  sourceType: SourceType,
): SummaryAttempt {
  return db.transaction((tx) => {
    const source = readSource(tx, bookmarkId, userId);
    if (!source) throw new Error("Summary source not found");
    const previous = tx
      .select({ taggingStatus: summaryProcessing.taggingStatus })
      .from(summaryProcessing)
      .where(eq(summaryProcessing.bookmarkId, bookmarkId))
      .get();
    const attempt: SummaryAttempt = {
      bookmarkId,
      userId,
      sourceType,
      sourceUrl: source.url,
      sourceVersion: source.version,
      generation: randomUUID(),
    };
    tx.insert(summaryProcessing)
      .values({
        ...attempt,
        status: "pending",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: summaryProcessing.bookmarkId,
        set: {
          generation: attempt.generation,
          sourceUrl: source.url,
          sourceVersion: source.version,
          sourceType,
          status: "pending",
          errorCode: null,
          notebookId: null,
          stage: "queued",
          provider: null,
          notebookErrorCode: null,
          hermesErrorCode: null,
          retryCount: 0,
          nextRetryAt: null,
          startedAt: new Date(),
          taggingStatus: null,
          taggingErrorCode: null,
          taggedSummaryHash: null,
          updatedAt: new Date(),
        },
      })
      .run();
    tx.update(bookmarks)
      .set({
        summarizationStatus: "pending",
        modifiedAt: new Date(),
        ...(previous?.taggingStatus ? { taggingStatus: null } : {}),
      })
      .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)))
      .run();
    return attempt;
  });
}

function isCurrentSource(db: SummaryDB, attempt: SummaryAttempt) {
  return (
    readSource(db, attempt.bookmarkId, attempt.userId)?.version ===
    attempt.sourceVersion
  );
}

export interface SummaryProgressUpdate {
  stage: "notebooklm" | "hermes";
  notebookErrorCode?: SummaryErrorCode;
  hermesErrorCode?: SummaryErrorCode;
}

export function recordSummaryProgress(
  db: DB,
  attempt: SummaryAttempt,
  progress: SummaryProgressUpdate,
) {
  return db.transaction((tx) => {
    if (!isCurrentSource(tx, attempt)) return false;
    return (
      tx
        .update(summaryProcessing)
        .set({ ...progress, nextRetryAt: null, updatedAt: new Date() })
        .where(attemptCondition(attempt))
        .run().changes > 0
    );
  });
}

export function publishSummary(
  db: DB,
  attempt: SummaryAttempt,
  result: {
    markdown: string;
    provider: "notebooklm" | "hermes";
    transcriptAssetId?: string;
    tagging?: boolean;
  },
): boolean {
  if (!result.markdown.trim()) throw new Error("Empty summary");
  return db.transaction((tx) => {
    if (!isCurrentSource(tx, attempt)) return false;
    const updated = tx
      .update(summaryProcessing)
      .set({
        status: "success",
        stage: "success",
        nextRetryAt: null,
        provider: result.provider,
        publishedGeneration: attempt.generation,
        publishedSourceVersion: summaryHash(
          JSON.stringify([
            attempt.sourceVersion,
            result.transcriptAssetId ?? null,
          ]),
        ),
        transcriptAssetId: result.transcriptAssetId ?? null,
        summaryHash: summaryHash(result.markdown),
        generatedAt: new Date(),
        updatedAt: new Date(),
        errorCode: null,
        taggingStatus: result.tagging ? "pending" : null,
        taggingErrorCode: null,
      })
      .where(attemptCondition(attempt))
      .run();
    if (!updated.changes) return false;
    tx.update(bookmarks)
      .set({
        summary: result.markdown,
        summarizationStatus: "success",
        modifiedAt: new Date(),
        ...(result.tagging ? { taggingStatus: "pending" as const } : {}),
      })
      .where(
        and(
          eq(bookmarks.id, attempt.bookmarkId),
          eq(bookmarks.userId, attempt.userId),
        ),
      )
      .run();
    return true;
  });
}

// Provider messages can contain source data or secrets. Persist only a stable category.
export function failSummaryAttempt(
  db: DB,
  attempt: SummaryAttempt,
  errorCode: SummaryErrorCode,
): boolean {
  return db.transaction((tx) => {
    if (!isCurrentSource(tx, attempt)) return false;
    const updated = tx
      .update(summaryProcessing)
      .set({
        status: "failure",
        stage: "failure",
        nextRetryAt: null,
        taggingStatus: null,
        taggingErrorCode: null,
        errorCode,
        updatedAt: new Date(),
      })
      .where(attemptCondition(attempt))
      .run();
    if (!updated.changes) return false;
    tx.update(bookmarks)
      .set({ summarizationStatus: "failure", modifiedAt: new Date() })
      .where(
        and(
          eq(bookmarks.id, attempt.bookmarkId),
          eq(bookmarks.userId, attempt.userId),
        ),
      )
      .run();
    return true;
  });
}

export function invalidateChangedSummarySource(
  db: DB,
  bookmarkId: string,
  userId: string,
): boolean {
  return db.transaction((tx) => {
    const state = tx
      .select()
      .from(summaryProcessing)
      .where(
        and(
          eq(summaryProcessing.bookmarkId, bookmarkId),
          eq(summaryProcessing.userId, userId),
        ),
      )
      .get();
    if (!state) return false;
    const source = readSource(tx, bookmarkId, userId);
    if (!source || source.version === state.sourceVersion) return false;
    tx.update(summaryProcessing)
      .set({
        generation: randomUUID(),
        sourceVersion: source.version,
        sourceUrl: source.url,
        status: "failure",
        stage: "failure",
        nextRetryAt: null,
        errorCode: "source_changed",
        taggingStatus: null,
        taggingErrorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(summaryProcessing.bookmarkId, bookmarkId))
      .run();
    tx.update(bookmarks)
      .set({
        summarizationStatus: "failure",
        modifiedAt: new Date(),
        ...(state.taggingStatus ? { taggingStatus: null } : {}),
      })
      .where(eq(bookmarks.id, bookmarkId))
      .run();
    return true;
  });
}

export function getPublishedReaderSummary(
  db: SummaryDB,
  bookmarkId: string,
  userId: string,
): string | null {
  // Validate in one transaction so a source update cannot race the eligibility check.
  return db.transaction((tx) => {
    const state = tx
      .select()
      .from(summaryProcessing)
      .where(
        and(
          eq(summaryProcessing.bookmarkId, bookmarkId),
          eq(summaryProcessing.userId, userId),
        ),
      )
      .get();
    if (
      !state ||
      state.status !== "success" ||
      state.publishedGeneration !== state.generation ||
      !state.publishedSourceVersion
    )
      return null;
    if (readSource(tx, bookmarkId, userId)?.version !== state.sourceVersion)
      return null;
    const bookmark = tx
      .select({
        summary: bookmarks.summary,
        status: bookmarks.summarizationStatus,
      })
      .from(bookmarks)
      .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)))
      .get();
    if (
      !bookmark?.summary ||
      bookmark.status !== "success" ||
      summaryHash(bookmark.summary) !== state.summaryHash
    )
      return null;
    return bookmark.summary;
  });
}

export function currentSummaryAttempt(
  db: SummaryDB,
  bookmarkId: string,
  userId: string,
  generation: string,
): SummaryAttempt | null {
  const row = db
    .select()
    .from(summaryProcessing)
    .where(
      and(
        eq(summaryProcessing.bookmarkId, bookmarkId),
        eq(summaryProcessing.userId, userId),
        eq(summaryProcessing.generation, generation),
      ),
    )
    .get();
  if (!row || readSource(db, bookmarkId, userId)?.version !== row.sourceVersion)
    return null;
  return {
    bookmarkId,
    userId,
    generation,
    sourceUrl: row.sourceUrl,
    sourceVersion: row.sourceVersion,
    sourceType: row.sourceType,
  };
}
