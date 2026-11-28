import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import type { KarakeepDBTransaction } from "@karakeep/db";
import {
  bookmarks,
  bookmarkLinks,
  bookmarkTexts,
  bookmarkAssets,
  bookmarkHistory,
  bookmarkTags,
  tagsOnBookmarks,
  bookmarkLists,
  bookmarksInLists,
  assets,
} from "@karakeep/db/schema";

/**
 * Read the tracked state through the caller's transaction so the before/after
 * comparison observes the same write. Keep this projection explicit: processing
 * statuses, archived HTML, and other untracked data must not enter history.
 */
export function historySnapshot(tx: KarakeepDBTransaction, id: string) {
  const item = tx.select().from(bookmarks).where(eq(bookmarks.id, id)).get();
  if (!item)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
  const link = tx
    .select({
      url: bookmarkLinks.url,
      description: bookmarkLinks.description,
      author: bookmarkLinks.author,
      publisher: bookmarkLinks.publisher,
      datePublished: bookmarkLinks.datePublished,
      dateModified: bookmarkLinks.dateModified,
    })
    .from(bookmarkLinks)
    .where(eq(bookmarkLinks.id, id))
    .get();
  const text = tx
    .select()
    .from(bookmarkTexts)
    .where(eq(bookmarkTexts.id, id))
    .get();
  const asset = tx
    .select()
    .from(bookmarkAssets)
    .where(eq(bookmarkAssets.id, id))
    .get();
  // createdAt is the public saved-date field, not the immutable first-created date.
  const fields: Record<string, unknown> = {};
  for (const key of [
    "title",
    "note",
    "summary",
    "archived",
    "favourited",
    "createdAt",
  ] as const)
    fields[key] = item[key];
  if (link)
    for (const key of [
      "url",
      "description",
      "author",
      "publisher",
      "datePublished",
      "dateModified",
    ] as const)
      fields[`link.${key}`] = link[key];
  if (text) fields["text"] = text.text;
  if (asset) fields["assetContent"] = asset.content;
  // Store relationship names and metadata as values, rather than resolving them
  // later: the referenced tag, list, or file may be renamed or deleted. Sorting
  // by ID prevents query ordering alone from appearing as a relationship edit.
  fields.tags = tx
    .select({
      id: bookmarkTags.id,
      name: bookmarkTags.name,
      attachedBy: tagsOnBookmarks.attachedBy,
    })
    .from(tagsOnBookmarks)
    .innerJoin(bookmarkTags, eq(tagsOnBookmarks.tagId, bookmarkTags.id))
    .where(eq(tagsOnBookmarks.bookmarkId, id))
    .all()
    .sort((a, b) => a.id.localeCompare(b.id));
  fields.lists = tx
    .select({ id: bookmarkLists.id, name: bookmarkLists.name })
    .from(bookmarksInLists)
    .innerJoin(bookmarkLists, eq(bookmarksInLists.listId, bookmarkLists.id))
    .where(eq(bookmarksInLists.bookmarkId, id))
    .all()
    .sort((a, b) => a.id.localeCompare(b.id));
  fields.attachments = tx
    .select({
      id: assets.id,
      type: assets.assetType,
      fileName: assets.fileName,
      size: assets.size,
    })
    .from(assets)
    .where(eq(assets.bookmarkId, id))
    .all()
    .sort((a, b) => a.id.localeCompare(b.id));
  return { item, fields };
}

/**
 * Append one event containing all meaningful field changes in this transaction.
 * A deletion records the retained identity without reading a now-deleted row.
 * The caller owns authorization and must commit this insert with the mutation.
 */
export function recordHistory(
  tx: KarakeepDBTransaction,
  before: ReturnType<typeof historySnapshot>,
  actorId: string | null,
  deleted = false,
  actorKind: "user" | "apiKey" | "system" = actorId ? "user" : "system",
) {
  const after = deleted ? {} : historySnapshot(tx, before.item.id).fields;
  // An absent value and empty text display alike; bookkeeping-only edits are omitted.
  const normalize = (value: unknown) =>
    value === null || value === "" ? null : value;
  const changes = deleted
    ? []
    : Object.keys(before.fields).flatMap((field) =>
        JSON.stringify(normalize(before.fields[field])) ===
        JSON.stringify(normalize(after[field]))
          ? []
          : [{ field, oldValue: before.fields[field], newValue: after[field] }],
      );
  // No-op edits stay silent, but successful deletions still need an audit entry.
  if (!deleted && !changes.length) return;
  tx.insert(bookmarkHistory)
    .values({
      bookmarkId: before.item.id,
      ownerId: before.item.userId,
      actorId,
      actorKind,
      type: deleted ? "deleted" : "edit",
      title:
        before.item.title ??
        String(before.fields["link.url"] ?? before.fields["text"] ?? "").slice(
          0,
          100,
        ),
      changes,
    })
    .run();
}

import type { AuthedContext } from "../index";
/**
 * Wrap a synchronous relationship mutation and its history in an immediate SQLite
 * transaction. Resolve affected IDs before the write, including rows that a
 * cascade will remove. Keep network calls, queues, and file cleanup outside it.
 */
export function historyTransaction<T>(
  ctx: AuthedContext,
  ids: (tx: KarakeepDBTransaction) => string[],
  write: (tx: KarakeepDBTransaction) => T,
) {
  return ctx.db.transaction(
    (tx) => {
      // Internal callers also use these models for automation, which is outside
      // this release's capture scope. Duplicate IDs produce only one event.
      // The ID resolver can validate live associations as well as enumerate
      // affected rows. Run it for internal writes too, even when capture is off.
      const affectedIds = [...new Set(ids(tx))];
      const before =
        ctx.auth?.type === "internal"
          ? []
          : affectedIds.map((id) => historySnapshot(tx, id));
      const result = write(tx);
      for (const snapshot of before)
        recordHistory(
          tx,
          snapshot,
          ctx.user.id,
          false,
          ctx.auth?.type === "apiKey" ? "apiKey" : "user",
        );
      return result;
    },
    { behavior: "immediate" },
  );
}
/** Find bookmarks affected by a tag rename, merge, or deletion before links disappear. */
export function tagHistoryIds(tx: KarakeepDBTransaction, ids: string[]) {
  return ids.length
    ? tx
        .select({ id: tagsOnBookmarks.bookmarkId })
        .from(tagsOnBookmarks)
        .where(inArray(tagsOnBookmarks.tagId, ids))
        .all()
        .map((r) => r.id)
    : [];
}
/** Find stored manual-list memberships before a list or collaborator cascade removes them. */
export function listHistoryIds(tx: KarakeepDBTransaction, ids: string[]) {
  return ids.length
    ? tx
        .select({ id: bookmarksInLists.bookmarkId })
        .from(bookmarksInLists)
        .where(inArray(bookmarksInLists.listId, ids))
        .all()
        .map((r) => r.id)
    : [];
}
