import { z } from "zod";

// Everything a user can change about a bookmark that its history records.
// Internal state (crawl/tagging/summarization status, modifiedAt) and large
// bodies extracted from assets (assetContent) are not tracked.
export const BOOKMARK_HISTORY_FIELDS = [
  "created",
  "title",
  "url",
  "description",
  "author",
  "publisher",
  "datePublished",
  "createdAt",
  "text",
  "note",
  "summary",
  "archived",
  "favourited",
  "tags",
  "lists",
  "attachments",
] as const;

export const zBookmarkHistoryFieldSchema = z.enum(BOOKMARK_HISTORY_FIELDS);
export type ZBookmarkHistoryField = z.infer<typeof zBookmarkHistoryFieldSchema>;

// Fields whose change is a set of items added and removed rather than an old
// and a new value. For these, oldValue holds the removed items and newValue
// the added ones.
export const COLLECTION_HISTORY_FIELDS = [
  "tags",
  "lists",
  "attachments",
] as const satisfies readonly ZBookmarkHistoryField[];

// Changes that can't be rolled back: undoing them would mean restoring
// deleted files (attachments), deleting the bookmark (created), or touching
// lists the owner may no longer have access to (lists). They're recorded
// straight into the history instead of becoming the pending edit.
export const NON_UNDOABLE_HISTORY_FIELDS = [
  "created",
  "lists",
  "attachments",
] as const satisfies readonly ZBookmarkHistoryField[];

// Owner-specific state that collaborators must not see. Keep in sync with
// `Bookmark.asZBookmark()` in packages/trpc/models/bookmarks.ts, which hides
// note, archived and favourited from non-owners. List membership is hidden
// too, since it reveals the owner's private lists.
export const OWNER_ONLY_HISTORY_FIELDS = [
  "note",
  "archived",
  "favourited",
  "lists",
] as const satisfies readonly ZBookmarkHistoryField[];

export function isCollectionHistoryField(field: ZBookmarkHistoryField) {
  return (COLLECTION_HISTORY_FIELDS as readonly string[]).includes(field);
}

export function isUndoableHistoryField(field: ZBookmarkHistoryField) {
  return !(NON_UNDOABLE_HISTORY_FIELDS as readonly string[]).includes(field);
}

export function isOwnerOnlyHistoryField(field: ZBookmarkHistoryField) {
  return (OWNER_ONLY_HISTORY_FIELDS as readonly string[]).includes(field);
}

// A tag, list or attachment in a collection change. The name is the one it
// had at the time, so renames and deletions don't rewrite history.
export const zBookmarkHistoryItemSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  // Tags: who attached it, so a rollback can reattach it the same way.
  attachedBy: z.enum(["ai", "human"]).optional(),
  // Attachments: the kind of asset (e.g. "bannerImage").
  assetType: z.string().optional(),
});
export type ZBookmarkHistoryItem = z.infer<typeof zBookmarkHistoryItemSchema>;

// Dates are stored as ISO strings.
export const zBookmarkHistoryValueSchema = z.union([
  z.string(),
  z.boolean(),
  z.null(),
  z.array(zBookmarkHistoryItemSchema),
]);
export type ZBookmarkHistoryValue = z.infer<typeof zBookmarkHistoryValueSchema>;

export const zBookmarkHistoryChangeSchema = z.object({
  id: z.string(),
  field: zBookmarkHistoryFieldSchema,
  oldValue: zBookmarkHistoryValueSchema,
  newValue: zBookmarkHistoryValueSchema,
});
export type ZBookmarkHistoryChange = z.infer<
  typeof zBookmarkHistoryChangeSchema
>;

// One user action and every field it changed.
export const zBookmarkHistoryEventSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  editor: z.object({
    id: z.string(),
    name: z.string(),
  }),
  // The bookmark's latest edit, which the owner can still roll back. It
  // becomes final when the owner makes their next change.
  pending: z.boolean(),
  changes: z.array(zBookmarkHistoryChangeSchema),
});
export type ZBookmarkHistoryEvent = z.infer<typeof zBookmarkHistoryEventSchema>;

export const zGetBookmarkHistoryResponseSchema = z.object({
  events: z.array(zBookmarkHistoryEventSchema),
});
export type ZGetBookmarkHistoryResponse = z.infer<
  typeof zGetBookmarkHistoryResponseSchema
>;
