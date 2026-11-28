import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

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
  bookmarkTags,
  bookmarkTexts,
  tagsOnBookmarks,
  users,
} from "@karakeep/db/schema";
import type {
  ZBookmarkHistoryEvent,
  ZBookmarkHistoryField,
  ZBookmarkHistoryItem,
  ZBookmarkHistoryValue,
} from "@karakeep/shared/types/bookmarkHistory";
import {
  isCollectionHistoryField,
  isOwnerOnlyHistoryField,
  isUndoableHistoryField,
} from "@karakeep/shared/types/bookmarkHistory";
import type { ZUpdateBookmarksRequest } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

// Consecutive note edits by the same user within this window are merged into
// one pending edit. The note editor autosaves while typing, so without this
// every pause would become its own history entry.
export const NOTE_COALESCE_WINDOW_MS = 2 * 60 * 1000;

// Number of events getBookmarkHistory returns by default.
export const DEFAULT_HISTORY_LIMIT = 100;
// Upper bound on the rows read to build those events.
const MAX_HISTORY_ROWS = 1000;

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
  // The bookmark's "saved" date (bookmarks.createdAt).
  createdAt: Date;
  // Null for non-link bookmarks.
  link: {
    url: string;
    description: string | null;
    author: string | null;
    publisher: string | null;
    datePublished: Date | null;
  } | null;
  // Null for non-text bookmarks.
  text: { text: string | null } | null;
}

// The values a field's database column held before and after a change.
export interface StoredValues {
  oldValue: string | null;
  newValue: string | null;
}

export interface BookmarkFieldChange {
  field: ZBookmarkHistoryField;
  oldValue: ZBookmarkHistoryValue;
  newValue: ZBookmarkHistoryValue;
  // Only for the title. History shows the displayed title, which falls back
  // to the crawled title or the url, and that fallback can change before an
  // undo (a url edit, a recrawl). Undo checks and restores bookmarks.title
  // from these instead. Kept with the pending edit, not in the history.
  stored?: StoredValues;
}

interface PendingEditRow {
  id: string;
  eventId: string;
  bookmarkId: string;
  userId: string;
  field: ZBookmarkHistoryField;
  oldValue: ZBookmarkHistoryValue;
  newValue: ZBookmarkHistoryValue;
  // Null for other fields, and for title edits made before it existed.
  stored: StoredValues | null;
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

// datePublished and createdAt are stored with second precision.
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

  const pushDate = (
    field: ZBookmarkHistoryField,
    oldValue: Date | null,
    newValue: Date | null | undefined,
  ) => {
    if (newValue === undefined) {
      return;
    }
    const oldDate = toIsoSeconds(oldValue);
    const newDate = toIsoSeconds(newValue);
    if (oldDate !== newDate) {
      changes.push({ field, oldValue: oldDate, newValue: newDate });
    }
  };

  if (input.title !== undefined) {
    // Compare what the user sees: for a link without a custom title, the edit
    // dialog submits the crawled title, which isn't a visible change.
    const oldTitle = normalizeText(
      displayedTitle(before.title, before.fallbackTitle),
    );
    const newTitle = normalizeText(
      displayedTitle(input.title, before.fallbackTitle),
    );
    if (oldTitle !== newTitle) {
      changes.push({
        field: "title",
        oldValue: oldTitle,
        newValue: newTitle,
        // updateBookmark writes input.title as is.
        stored: { oldValue: before.title, newValue: input.title },
      });
    }
  }

  if (before.link) {
    // updateBookmark only writes the url when it's non-empty.
    if (input.url) {
      pushText("url", before.link.url, input.url.trim());
    }
    pushText("description", before.link.description, input.description);
    pushText("author", before.link.author, input.author);
    pushText("publisher", before.link.publisher, input.publisher);
    pushDate("datePublished", before.link.datePublished, input.datePublished);
  }

  pushDate("createdAt", before.createdAt, input.createdAt);

  // updateBookmark only writes the text when it's non-empty.
  if (before.text && input.text) {
    pushText("text", before.text.text, input.text);
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

/**
 * The change the deprecated updateBookmarkText endpoint makes, which (unlike
 * updateBookmark) also writes empty text.
 */
export function diffTextUpdate(
  before: BookmarkHistorySnapshot,
  text: string,
): BookmarkFieldChange[] {
  if (!before.text) {
    return [];
  }
  const oldValue = normalizeText(before.text.text);
  const newValue = normalizeText(text);
  return oldValue === newValue ? [] : [{ field: "text", oldValue, newValue }];
}

/**
 * The change between two states of a collection (tags, lists or
 * attachments): the removed items as oldValue and the added ones as
 * newValue. Returns null when nothing was added or removed.
 */
export function diffCollection(
  field: ZBookmarkHistoryField,
  before: ZBookmarkHistoryItem[],
  after: ZBookmarkHistoryItem[],
): BookmarkFieldChange | null {
  const beforeIds = new Set(before.map((i) => i.id));
  const afterIds = new Set(after.map((i) => i.id));
  const byName = (a: ZBookmarkHistoryItem, b: ZBookmarkHistoryItem) =>
    (a.name ?? "").localeCompare(b.name ?? "");
  const removed = before.filter((i) => !afterIds.has(i.id)).sort(byName);
  const added = after.filter((i) => !beforeIds.has(i.id)).sort(byName);
  if (removed.length === 0 && added.length === 0) {
    return null;
  }
  return { field, oldValue: removed, newValue: added };
}

/** The tags attached to a bookmark, as history items. */
export function readBookmarkTagItems(
  tx: KarakeepDBTransaction,
  bookmarkId: string,
): ZBookmarkHistoryItem[] {
  return tx
    .select({
      id: tagsOnBookmarks.tagId,
      name: bookmarkTags.name,
      attachedBy: tagsOnBookmarks.attachedBy,
    })
    .from(tagsOnBookmarks)
    .innerJoin(bookmarkTags, eq(bookmarkTags.id, tagsOnBookmarks.tagId))
    .where(eq(tagsOnBookmarks.bookmarkId, bookmarkId))
    .all();
}

// The value of a scalar field as diffBookmarkUpdate() records it.
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
    case "createdAt":
      return toIsoSeconds(snapshot.createdAt);
    case "text":
      return normalizeText(snapshot.text?.text);
    case "note":
      return normalizeText(snapshot.note);
    case "summary":
      return normalizeText(snapshot.summary);
    case "archived":
      return snapshot.archived;
    case "favourited":
      return snapshot.favourited;
    case "created":
    case "tags":
    case "lists":
    case "attachments":
      return null;
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
      type: bookmarks.type,
      title: bookmarks.title,
      note: bookmarks.note,
      summary: bookmarks.summary,
      archived: bookmarks.archived,
      favourited: bookmarks.favourited,
      createdAt: bookmarks.createdAt,
      linkUrl: bookmarkLinks.url,
      linkTitle: bookmarkLinks.title,
      linkDescription: bookmarkLinks.description,
      linkAuthor: bookmarkLinks.author,
      linkPublisher: bookmarkLinks.publisher,
      linkDatePublished: bookmarkLinks.datePublished,
      assetFileName: bookmarkAssets.fileName,
      text: bookmarkTexts.text,
    })
    .from(bookmarks)
    .leftJoin(bookmarkLinks, eq(bookmarkLinks.id, bookmarks.id))
    .leftJoin(bookmarkAssets, eq(bookmarkAssets.id, bookmarks.id))
    .leftJoin(bookmarkTexts, eq(bookmarkTexts.id, bookmarks.id))
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
    createdAt: row.createdAt,
    link,
    text: row.type === BookmarkTypes.TEXT ? { text: row.text } : null,
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
    eventId: string;
    bookmarkId: string;
    userId: string;
    field: ZBookmarkHistoryField;
    oldValue: string | null;
    newValue: string | null;
    stored: string | null;
    createdAt: number;
  }>(
    sql`SELECT id, eventId, bookmarkId, userId, field, oldValue, newValue, stored, createdAt
        FROM ${pendingEdits}
        WHERE bookmarkId = ${bookmarkId}
        ORDER BY rowid`,
  );
  return rows.map((row) => ({
    ...row,
    oldValue: parseJson(row.oldValue),
    newValue: parseJson(row.newValue),
    stored:
      row.stored === null ? null : (JSON.parse(row.stored) as StoredValues),
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

/**
 * Deletes the pending edits on a user's bookmarks and those the user made.
 * The pending store is a separate file without foreign keys, so deleting the
 * user doesn't cascade to it the way it does to bookmarkEditHistory. Must run
 * in the transaction that deletes the user, before the delete, while the
 * user's bookmarks still exist.
 */
export function deletePendingEditsOfUser(
  tx: KarakeepDBTransaction,
  userId: string,
) {
  if (!pendingHistoryState.available) {
    return;
  }
  tx.run(
    sql`DELETE FROM ${pendingEdits}
        WHERE userId = ${userId}
           OR bookmarkId IN (
             SELECT ${bookmarks.id} FROM ${bookmarks}
             WHERE ${bookmarks.userId} = ${userId}
           )`,
  );
}

interface NewEvent {
  eventId: string;
  bookmarkId: string;
  userId: string;
  changes: BookmarkFieldChange[];
  now: Date;
}

function insertPendingEdits(tx: KarakeepDBTransaction, event: NewEvent) {
  for (const change of event.changes) {
    tx.run(
      sql`INSERT INTO ${pendingEdits}
            (id, eventId, bookmarkId, userId, field, oldValue, newValue, stored, createdAt)
          VALUES (
            ${randomUUID()}, ${event.eventId}, ${event.bookmarkId}, ${event.userId},
            ${change.field}, ${JSON.stringify(change.oldValue)},
            ${JSON.stringify(change.newValue)},
            ${change.stored ? JSON.stringify(change.stored) : null},
            ${event.now.getTime()}
          )`,
    );
  }
}

function insertCommittedEdits(tx: KarakeepDBTransaction, event: NewEvent) {
  tx.insert(bookmarkEditHistory)
    .values(
      event.changes.map((change) => ({
        eventId: event.eventId,
        bookmarkId: event.bookmarkId,
        userId: event.userId,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        createdAt: event.now,
      })),
    )
    .run();
}

// Moves the pending edit, which is final now, into bookmarkEditHistory.
function commitPendingEdits(
  tx: KarakeepDBTransaction,
  bookmarkId: string,
  pending: PendingEditRow[],
) {
  if (pending.length === 0) {
    return;
  }
  // Reusing the pending ids keeps this idempotent. The stored values are only
  // needed for undo, so they stay behind.
  tx.insert(bookmarkEditHistory)
    .values(pending.map(({ stored: _stored, ...row }) => row))
    .onConflictDoNothing()
    .run();
  deletePendingEdits(tx, bookmarkId);
}

/**
 * Records one user action on a bookmark. Must run inside the transaction that
 * makes the change, so a failed change leaves no history behind.
 *
 * When the bookmark's owner makes a change, whatever edit was pending before
 * is final now and moves into bookmarkEditHistory. The new change becomes
 * the pending edit, which the owner can roll back, unless it can't be undone
 * (see NON_UNDOABLE_HISTORY_FIELDS) or `undoable: false` is passed; those go
 * straight into bookmarkEditHistory.
 *
 * Changes by other users (e.g. a collaborator removing the bookmark from a
 * shared list) are recorded directly and leave the owner's pending edit
 * alone.
 */
export function recordBookmarkChanges(
  tx: KarakeepDBTransaction,
  opts: {
    bookmarkId: string;
    userId: string;
    changes: BookmarkFieldChange[];
    undoable?: boolean;
    now?: Date;
  },
) {
  const { bookmarkId, userId, changes } = opts;
  if (changes.length === 0) {
    return;
  }
  const owner = tx
    .select({ userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId))
    .get();
  if (!owner) {
    return;
  }

  const event: NewEvent = {
    eventId: randomUUID(),
    bookmarkId,
    userId,
    changes,
    now: opts.now ?? new Date(),
  };

  if (!pendingHistoryState.available || userId !== owner.userId) {
    // No pending store (no rollback support), or not the owner's change.
    insertCommittedEdits(tx, event);
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
    event.now.getTime() - pending[0].createdAt.getTime() <
      NOTE_COALESCE_WINDOW_MS
  ) {
    if (pending[0].oldValue === changes[0].newValue) {
      // Typed back to what it was: nothing changed after all.
      deletePendingEdits(tx, bookmarkId);
    } else {
      tx.run(
        sql`UPDATE ${pendingEdits}
            SET newValue = ${JSON.stringify(changes[0].newValue)},
                createdAt = ${event.now.getTime()}
            WHERE id = ${pending[0].id}`,
      );
    }
    return;
  }

  commitPendingEdits(tx, bookmarkId, pending);

  const undoable =
    (opts.undoable ?? true) &&
    changes.every((change) => isUndoableHistoryField(change.field));
  if (undoable) {
    insertPendingEdits(tx, event);
  } else {
    insertCommittedEdits(tx, event);
  }
}

/**
 * Records the same user action on many bookmarks at once (e.g. merging or
 * deleting a tag). These changes can't be rolled back per bookmark.
 */
export function recordBookmarkChangesForMany(
  tx: KarakeepDBTransaction,
  opts: {
    userId: string;
    entries: { bookmarkId: string; changes: BookmarkFieldChange[] }[];
    now?: Date;
  },
) {
  const now = opts.now ?? new Date();
  for (const entry of opts.entries) {
    recordBookmarkChanges(tx, {
      ...entry,
      userId: opts.userId,
      undoable: false,
      now,
    });
  }
}

function itemsOf(value: ZBookmarkHistoryValue): ZBookmarkHistoryItem[] {
  return Array.isArray(value) ? value : [];
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
  // silently overwrite that. Tags are restored item by item instead, so tags
  // changed since by others are left as they are.
  for (const edit of pending) {
    if (isCollectionHistoryField(edit.field)) {
      continue;
    }
    const changedSince = edit.stored
      ? snapshot.title !== edit.stored.newValue
      : currentValue(snapshot, edit.field) !== edit.newValue;
    if (changedSince) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `The ${edit.field} was changed again since this edit, so it can't be rolled back`,
      });
    }
  }

  const bookmarkUpdate: Partial<typeof bookmarks.$inferInsert> = {};
  const linkUpdate: Partial<typeof bookmarkLinks.$inferInsert> = {};
  for (const { field, oldValue, newValue, stored } of pending) {
    switch (field) {
      case "title":
        if (stored) {
          bookmarkUpdate.title = stored.oldValue;
        } else {
          // Pending files from before `stored` existed: the old value may be
          // the fallback the UI showed, not a custom title.
          bookmarkUpdate.title =
            oldValue === null || oldValue === snapshot.fallbackTitle
              ? null
              : (oldValue as string);
        }
        break;
      case "note":
      case "summary":
        bookmarkUpdate[field] = oldValue as string | null;
        break;
      case "archived":
      case "favourited":
        bookmarkUpdate[field] = oldValue as boolean;
        break;
      case "createdAt":
        bookmarkUpdate.createdAt = new Date(oldValue as string);
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
      case "text":
        tx.update(bookmarkTexts)
          .set({ text: oldValue as string | null })
          .where(eq(bookmarkTexts.id, bookmarkId))
          .run();
        break;
      case "tags":
        rollbackTagChange(tx, bookmarkId, {
          removed: itemsOf(oldValue),
          added: itemsOf(newValue),
        });
        break;
      case "created":
      case "lists":
      case "attachments":
        // Never pending (see recordBookmarkChanges).
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

function rollbackTagChange(
  tx: KarakeepDBTransaction,
  bookmarkId: string,
  change: { removed: ZBookmarkHistoryItem[]; added: ZBookmarkHistoryItem[] },
) {
  if (change.added.length > 0) {
    tx.delete(tagsOnBookmarks)
      .where(
        and(
          eq(tagsOnBookmarks.bookmarkId, bookmarkId),
          inArray(
            tagsOnBookmarks.tagId,
            change.added.map((t) => t.id),
          ),
        ),
      )
      .run();
  }
  if (change.removed.length > 0) {
    // Only reattach tags that still exist.
    const existing = new Set(
      tx
        .select({ id: bookmarkTags.id })
        .from(bookmarkTags)
        .where(
          inArray(
            bookmarkTags.id,
            change.removed.map((t) => t.id),
          ),
        )
        .all()
        .map((t) => t.id),
    );
    const toAttach = change.removed.filter((t) => existing.has(t.id));
    if (toAttach.length > 0) {
      tx.insert(tagsOnBookmarks)
        .values(
          toAttach.map((t) => ({
            bookmarkId,
            tagId: t.id,
            attachedBy: t.attachedBy ?? "human",
          })),
        )
        .onConflictDoNothing()
        .run();
    }
  }
}

interface HistoryRow {
  id: string;
  eventId: string;
  field: ZBookmarkHistoryField;
  oldValue: ZBookmarkHistoryValue;
  newValue: ZBookmarkHistoryValue;
  createdAt: Date;
  editorId: string;
  editorName: string;
}

// Groups rows (in the order their changes should be listed) into events.
function groupIntoEvents(
  rows: HistoryRow[],
  pending: boolean,
): ZBookmarkHistoryEvent[] {
  const events = new Map<string, ZBookmarkHistoryEvent>();
  for (const row of rows) {
    let event = events.get(row.eventId);
    if (!event) {
      event = {
        id: row.eventId,
        createdAt: row.createdAt,
        editor: { id: row.editorId, name: row.editorName },
        pending,
        changes: [],
      };
      events.set(row.eventId, event);
    }
    event.changes.push({
      id: row.id,
      field: row.field,
      oldValue: row.oldValue ?? null,
      newValue: row.newValue ?? null,
    });
  }
  return [...events.values()];
}

/**
 * Returns a bookmark's history as events, newest first, each listing the
 * fields it changed in the order they were recorded. Callers must have
 * already checked that the user can view the bookmark. Owner-only fields are
 * left out unless `includeOwnerOnlyFields` is set.
 */
export async function getBookmarkHistory(
  db: DB,
  bookmarkId: string,
  opts: { includeOwnerOnlyFields: boolean; limit?: number },
): Promise<ZBookmarkHistoryEvent[]> {
  const isVisible = (row: { field: ZBookmarkHistoryField }) =>
    opts.includeOwnerOnlyFields || !isOwnerOnlyHistoryField(row.field);

  const pending = db.transaction((tx) => readPendingEdits(tx, bookmarkId));
  const editorNames = new Map<string, string>();
  for (const id of new Set(pending.map((p) => p.userId))) {
    const user = await db.query.users.findFirst({
      columns: { name: true },
      where: eq(users.id, id),
    });
    editorNames.set(id, user?.name ?? "");
  }

  // Newest rows first, so the limit keeps the most recent events.
  const committed = await db
    .select({
      id: bookmarkEditHistory.id,
      eventId: bookmarkEditHistory.eventId,
      field: bookmarkEditHistory.field,
      oldValue: bookmarkEditHistory.oldValue,
      newValue: bookmarkEditHistory.newValue,
      createdAt: bookmarkEditHistory.createdAt,
      editorId: users.id,
      editorName: users.name,
    })
    .from(bookmarkEditHistory)
    .innerJoin(users, eq(users.id, bookmarkEditHistory.userId))
    .where(eq(bookmarkEditHistory.bookmarkId, bookmarkId))
    .orderBy(
      desc(bookmarkEditHistory.createdAt),
      desc(sql`${bookmarkEditHistory}.rowid`),
    )
    .limit(MAX_HISTORY_ROWS);

  const pendingEvents = groupIntoEvents(
    pending.filter(isVisible).map((row) => ({
      ...row,
      editorId: row.userId,
      editorName: editorNames.get(row.userId) ?? "",
    })),
    /* pending: */ true,
  );
  // Reversed so each event lists its changes in the order they were recorded.
  const committedEvents = groupIntoEvents(
    committed
      .filter(isVisible)
      .reverse()
      .map((row) => ({
        ...row,
        oldValue: row.oldValue ?? null,
        newValue: row.newValue ?? null,
      })),
    /* pending: */ false,
  ).reverse();

  // A collaborator's change can be newer than the owner's pending edit. On a
  // tie, the pending edit comes first.
  return [...pendingEvents, ...committedEvents]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, opts.limit ?? DEFAULT_HISTORY_LIMIT);
}
