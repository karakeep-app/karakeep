import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";

import type { DB, KarakeepDBTransaction } from "@karakeep/db";
import {
  PENDING_EDITS_TABLE,
  pendingHistoryState,
} from "@karakeep/db/pendingHistory";
import {
  bookmarkAssets,
  bookmarkEditHistory,
  bookmarkLinks,
  bookmarks,
  users,
} from "@karakeep/db/schema";
import type {
  ZBookmarkHistoryEntry,
  ZBookmarkHistoryField,
  ZBookmarkHistoryValue,
} from "@karakeep/shared/types/bookmarkHistory";
import { OWNER_ONLY_HISTORY_FIELDS } from "@karakeep/shared/types/bookmarkHistory";
import type { ZUpdateBookmarksRequest } from "@karakeep/shared/types/bookmarks";

// Consecutive note edits by the same user within this window are merged into
// one pending edit. The note editor autosaves while typing, so without this
// every pause would become its own history entry.
export const NOTE_COALESCE_WINDOW_MS = 2 * 60 * 1000;

export const DEFAULT_HISTORY_LIMIT = 100;

const pendingEdits = sql.raw(PENDING_EDITS_TABLE);

// The state of a bookmark that its edit history is diffed against.
export interface BookmarkHistorySnapshot {
  // The user-set title (bookmarks.title).
  title: string | null;
  // What the UI shows when there is no user-set title. Mirrors
  // getBookmarkTitle() in packages/shared/utils/bookmarkUtils.ts.
  fallbackTitle: string | null;
  note: string | null;
  summary: string | null;
  archived: boolean;
  favourited: boolean;
  // Null for non-link bookmarks.
  link: {
    url: string;
    description: string | null;
    author: string | null;
    publisher: string | null;
    datePublished: Date | null;
  } | null;
}

export interface BookmarkFieldChange {
  field: ZBookmarkHistoryField;
  oldValue: ZBookmarkHistoryValue;
  newValue: ZBookmarkHistoryValue;
}

interface PendingEditRow {
  id: string;
  bookmarkId: string;
  userId: string;
  field: ZBookmarkHistoryField;
  oldValue: ZBookmarkHistoryValue;
  newValue: ZBookmarkHistoryValue;
  createdAt: Date;
}

// Empty strings and nulls both mean "no value". The edit dialog sends "" for
// fields that are null in the database, which must not count as a change.
function normalizeText(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === "" ? null : value;
}

function displayedTitle(
  title: string | null | undefined,
  fallbackTitle: string | null,
): string | null {
  // Same truthiness check as getBookmarkTitle().
  return title ? title : fallbackTitle;
}

// datePublished is stored with second precision.
function toSeconds(date: Date | null): number | null {
  return date === null ? null : Math.floor(date.getTime() / 1000);
}

function toIsoSeconds(date: Date | null): string | null {
  const seconds = toSeconds(date);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

/**
 * Computes the user-visible field changes an updateBookmark request makes.
 * Fields that are absent from the request, or whose value would not change,
 * produce no entry.
 */
export function diffBookmarkUpdate(
  before: BookmarkHistorySnapshot,
  input: Omit<ZUpdateBookmarksRequest, "bookmarkId">,
): BookmarkFieldChange[] {
  const changes: BookmarkFieldChange[] = [];

  const pushText = (
    field: ZBookmarkHistoryField,
    oldValue: string | null,
    newValue: string | null | undefined,
  ) => {
    if (newValue === undefined) {
      return;
    }
    const oldNorm = normalizeText(oldValue);
    const newNorm = normalizeText(newValue);
    if (oldNorm !== newNorm) {
      changes.push({ field, oldValue: oldNorm, newValue: newNorm });
    }
  };

  if (input.title !== undefined) {
    // Compare what the user sees: for a link without a custom title, the edit
    // dialog submits the crawled title, which isn't a visible change.
    const oldTitle = displayedTitle(before.title, before.fallbackTitle);
    const newTitle = displayedTitle(input.title, before.fallbackTitle);
    pushText("title", oldTitle, newTitle);
  }

  if (before.link) {
    // updateBookmark only writes the url when it's non-empty.
    if (input.url) {
      pushText("url", before.link.url, input.url.trim());
    }
    pushText("description", before.link.description, input.description);
    pushText("author", before.link.author, input.author);
    pushText("publisher", before.link.publisher, input.publisher);
    if (input.datePublished !== undefined) {
      const oldDate = toIsoSeconds(before.link.datePublished);
      const newDate = toIsoSeconds(input.datePublished);
      if (oldDate !== newDate) {
        changes.push({
          field: "datePublished",
          oldValue: oldDate,
          newValue: newDate,
        });
      }
    }
  }

  pushText("note", before.note, input.note);
  pushText("summary", before.summary, input.summary);

  if (input.archived !== undefined && input.archived !== before.archived) {
    changes.push({
      field: "archived",
      oldValue: before.archived,
      newValue: input.archived,
    });
  }
  if (
    input.favourited !== undefined &&
    input.favourited !== before.favourited
  ) {
    changes.push({
      field: "favourited",
      oldValue: before.favourited,
      newValue: input.favourited,
    });
  }

  return changes;
}

// The value of a field as diffBookmarkUpdate() records it.
function currentValue(
  snapshot: BookmarkHistorySnapshot,
  field: ZBookmarkHistoryField,
): ZBookmarkHistoryValue {
  switch (field) {
    case "title":
      return normalizeText(
        displayedTitle(snapshot.title, snapshot.fallbackTitle),
      );
    case "url":
      return snapshot.link?.url ?? null;
    case "description":
      return normalizeText(snapshot.link?.description);
    case "author":
      return normalizeText(snapshot.link?.author);
    case "publisher":
      return normalizeText(snapshot.link?.publisher);
    case "datePublished":
      return toIsoSeconds(snapshot.link?.datePublished ?? null);
    case "note":
      return normalizeText(snapshot.note);
    case "summary":
      return normalizeText(snapshot.summary);
    case "archived":
      return snapshot.archived;
    case "favourited":
      return snapshot.favourited;
  }
}

/**
 * Reads the fields that history is diffed against. Must run inside the same
 * transaction as the update so the "before" state can't race with it.
 */
export function readBookmarkHistorySnapshot(
  tx: KarakeepDBTransaction,
  bookmarkId: string,
): BookmarkHistorySnapshot | undefined {
  const row = tx
    .select({
      title: bookmarks.title,
      note: bookmarks.note,
      summary: bookmarks.summary,
      archived: bookmarks.archived,
      favourited: bookmarks.favourited,
      linkUrl: bookmarkLinks.url,
      linkTitle: bookmarkLinks.title,
      linkDescription: bookmarkLinks.description,
      linkAuthor: bookmarkLinks.author,
      linkPublisher: bookmarkLinks.publisher,
      linkDatePublished: bookmarkLinks.datePublished,
      assetFileName: bookmarkAssets.fileName,
    })
    .from(bookmarks)
    .leftJoin(bookmarkLinks, eq(bookmarkLinks.id, bookmarks.id))
    .leftJoin(bookmarkAssets, eq(bookmarkAssets.id, bookmarks.id))
    .where(eq(bookmarks.id, bookmarkId))
    .get();

  if (!row) {
    return undefined;
  }

  const link =
    row.linkUrl !== null
      ? {
          url: row.linkUrl,
          description: row.linkDescription,
          author: row.linkAuthor,
          publisher: row.linkPublisher,
          datePublished: row.linkDatePublished,
        }
      : null;

  return {
    title: row.title,
    fallbackTitle: link
      ? (row.linkTitle ?? link.url)
      : (row.assetFileName ?? null),
    note: row.note,
    summary: row.summary,
    archived: row.archived,
    favourited: row.favourited,
    link,
  };
}

// ---------------------------------------------------------------------------
// Pending store (the attached pending_history.db)
// ---------------------------------------------------------------------------

function parseJson(value: string | null): ZBookmarkHistoryValue {
  return value === null ? null : (JSON.parse(value) as ZBookmarkHistoryValue);
}

function readPendingEdits(
  tx: KarakeepDBTransaction,
  bookmarkId: string,
): PendingEditRow[] {
  if (!pendingHistoryState.available) {
    return [];
  }
  const rows = tx.all<{
    id: string;
    bookmarkId: string;
    userId: string;
    field: ZBookmarkHistoryField;
    oldValue: string | null;
    newValue: string | null;
    createdAt: number;
  }>(
    sql`SELECT id, bookmarkId, userId, field, oldValue, newValue, createdAt
        FROM ${pendingEdits}
        WHERE bookmarkId = ${bookmarkId}
        ORDER BY rowid`,
  );
  return rows.map((row) => ({
    ...row,
    oldValue: parseJson(row.oldValue),
    newValue: parseJson(row.newValue),
    createdAt: new Date(row.createdAt),
  }));
}

export function deletePendingEdits(
  tx: KarakeepDBTransaction,
  bookmarkId: string,
) {
  if (!pendingHistoryState.available) {
    return;
  }
  tx.run(sql`DELETE FROM ${pendingEdits} WHERE bookmarkId = ${bookmarkId}`);
}

function insertPendingEdits(
  tx: KarakeepDBTransaction,
  opts: {
    bookmarkId: string;
    userId: string;
    changes: BookmarkFieldChange[];
    now: Date;
  },
) {
  for (const change of opts.changes) {
    tx.run(
      sql`INSERT INTO ${pendingEdits}
            (id, bookmarkId, userId, field, oldValue, newValue, createdAt)
          VALUES (
            ${randomUUID()}, ${opts.bookmarkId}, ${opts.userId}, ${change.field},
            ${JSON.stringify(change.oldValue)}, ${JSON.stringify(change.newValue)},
            ${opts.now.getTime()}
          )`,
    );
  }
}

/**
 * Records the changes of an edit. Must run inside the update transaction so a
 * failed update leaves no history behind.
 *
 * The edit becomes the bookmark's pending edit, which the user can roll back.
 * Whatever edit was pending before is final now and moves into the main
 * bookmarkEditHistory table.
 */
export function recordBookmarkChanges(
  tx: KarakeepDBTransaction,
  opts: {
    bookmarkId: string;
    userId: string;
    changes: BookmarkFieldChange[];
    now?: Date;
  },
) {
  const now = opts.now ?? new Date();
  const { bookmarkId, userId, changes } = opts;
  if (changes.length === 0) {
    return;
  }

  if (!pendingHistoryState.available) {
    // No pending store: record directly, without rollback support.
    tx.insert(bookmarkEditHistory)
      .values(
        changes.map((change) => ({
          bookmarkId,
          userId,
          ...change,
          createdAt: now,
        })),
      )
      .run();
    return;
  }

  const pending = readPendingEdits(tx, bookmarkId);

  // Note autosave: fold it into the pending note edit instead of committing
  // every keystroke pause.
  const isNoteOnly = (rows: { field: ZBookmarkHistoryField }[]) =>
    rows.length === 1 && rows[0].field === "note";
  if (
    isNoteOnly(changes) &&
    isNoteOnly(pending) &&
    pending[0].userId === userId &&
    now.getTime() - pending[0].createdAt.getTime() < NOTE_COALESCE_WINDOW_MS
  ) {
    if (pending[0].oldValue === changes[0].newValue) {
      // Typed back to what it was: nothing changed after all.
      deletePendingEdits(tx, bookmarkId);
    } else {
      tx.run(
        sql`UPDATE ${pendingEdits}
            SET newValue = ${JSON.stringify(changes[0].newValue)},
                createdAt = ${now.getTime()}
            WHERE id = ${pending[0].id}`,
      );
    }
    return;
  }

  if (pending.length > 0) {
    // Reusing the pending ids keeps this idempotent.
    tx.insert(bookmarkEditHistory).values(pending).onConflictDoNothing().run();
    deletePendingEdits(tx, bookmarkId);
  }
  insertPendingEdits(tx, { bookmarkId, userId, changes, now });
}

/**
 * Undoes the bookmark's pending edit: restores the previous field values and
 * discards the pending entries. Callers must have checked ownership.
 */
export function rollbackPendingEdit(
  tx: KarakeepDBTransaction,
  bookmarkId: string,
): BookmarkFieldChange[] {
  const pending = readPendingEdits(tx, bookmarkId);
  if (pending.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "There is no change to roll back",
    });
  }
  const snapshot = readBookmarkHistorySnapshot(tx, bookmarkId);
  if (!snapshot) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
  }

  // Something else (e.g. a recrawl) may have changed these fields since. Don't
  // silently overwrite that.
  for (const edit of pending) {
    if (currentValue(snapshot, edit.field) !== edit.newValue) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `The ${edit.field} was changed again since this edit, so it can't be rolled back`,
      });
    }
  }

  const bookmarkUpdate: Partial<typeof bookmarks.$inferInsert> = {};
  const linkUpdate: Partial<typeof bookmarkLinks.$inferInsert> = {};
  for (const { field, oldValue } of pending) {
    switch (field) {
      case "title":
        // The old value may be the fallback the UI showed, not a custom title.
        bookmarkUpdate.title =
          oldValue === null || oldValue === snapshot.fallbackTitle
            ? null
            : (oldValue as string);
        break;
      case "note":
      case "summary":
        bookmarkUpdate[field] = oldValue as string | null;
        break;
      case "archived":
      case "favourited":
        bookmarkUpdate[field] = oldValue as boolean;
        break;
      case "url":
        linkUpdate.url = oldValue as string;
        break;
      case "description":
      case "author":
      case "publisher":
        linkUpdate[field] = oldValue as string | null;
        break;
      case "datePublished":
        linkUpdate.datePublished =
          oldValue === null ? null : new Date(oldValue as string);
        break;
    }
  }

  if (Object.keys(linkUpdate).length > 0) {
    tx.update(bookmarkLinks)
      .set(linkUpdate)
      .where(eq(bookmarkLinks.id, bookmarkId))
      .run();
  }
  tx.update(bookmarks)
    .set({ ...bookmarkUpdate, modifiedAt: new Date() })
    .where(eq(bookmarks.id, bookmarkId))
    .run();

  deletePendingEdits(tx, bookmarkId);
  return pending.map(({ field, oldValue, newValue }) => ({
    field,
    oldValue,
    newValue,
  }));
}

/**
 * Returns a bookmark's edit history, newest first: the pending edit (if any)
 * followed by committed entries. Callers must have already checked that the
 * user can view the bookmark. Owner-only fields are left out unless
 * `includeOwnerOnlyFields` is set.
 */
export async function getBookmarkHistory(
  db: DB,
  bookmarkId: string,
  opts: { includeOwnerOnlyFields: boolean; limit?: number },
): Promise<ZBookmarkHistoryEntry[]> {
  const isVisible = (field: ZBookmarkHistoryField) =>
    opts.includeOwnerOnlyFields ||
    !(OWNER_ONLY_HISTORY_FIELDS as readonly string[]).includes(field);

  const pending = db.transaction((tx) => readPendingEdits(tx, bookmarkId));
  const pendingEditorIds = [...new Set(pending.map((p) => p.userId))];
  const editorNames = new Map<string, string>();
  for (const id of pendingEditorIds) {
    const user = await db.query.users.findFirst({
      columns: { name: true },
      where: eq(users.id, id),
    });
    editorNames.set(id, user?.name ?? "");
  }

  const committed = await db
    .select({
      id: bookmarkEditHistory.id,
      field: bookmarkEditHistory.field,
      oldValue: bookmarkEditHistory.oldValue,
      newValue: bookmarkEditHistory.newValue,
      createdAt: bookmarkEditHistory.createdAt,
      editorId: users.id,
      editorName: users.name,
    })
    .from(bookmarkEditHistory)
    .innerJoin(users, eq(users.id, bookmarkEditHistory.userId))
    .where(
      and(
        eq(bookmarkEditHistory.bookmarkId, bookmarkId),
        opts.includeOwnerOnlyFields
          ? undefined
          : notInArray(bookmarkEditHistory.field, [
              ...OWNER_ONLY_HISTORY_FIELDS,
            ]),
      ),
    )
    .orderBy(
      desc(bookmarkEditHistory.createdAt),
      // Rows of one edit share a timestamp; keep insertion order stable.
      desc(sql`${bookmarkEditHistory}.rowid`),
    )
    .limit(opts.limit ?? DEFAULT_HISTORY_LIMIT);

  return [
    // Pending rows are read in insertion order (the order they're committed
    // in), so reverse them to match the newest-first rowid order used for
    // committed rows; otherwise an edit's fields would reorder once committed.
    ...[...pending]
      .reverse()
      .filter((row) => isVisible(row.field))
      .map((row) => ({
        id: row.id,
        field: row.field,
        oldValue: row.oldValue,
        newValue: row.newValue,
        createdAt: row.createdAt,
        editor: { id: row.userId, name: editorNames.get(row.userId) ?? "" },
        pending: true,
      })),
    ...committed.map((row) => ({
      id: row.id,
      field: row.field,
      oldValue: row.oldValue ?? null,
      newValue: row.newValue ?? null,
      createdAt: row.createdAt,
      editor: { id: row.editorId, name: row.editorName },
      pending: false,
    })),
  ];
}
