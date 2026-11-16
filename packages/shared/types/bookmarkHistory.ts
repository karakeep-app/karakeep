import { z } from "zod";

// Fields of `bookmarks.updateBookmark` whose edits are recorded in the
// bookmark's edit history. Large content bodies (text, assetContent) and
// internal timestamps are intentionally not tracked.
export const BOOKMARK_HISTORY_FIELDS = [
  "title",
  "url",
  "description",
  "author",
  "publisher",
  "datePublished",
  "note",
  "summary",
  "archived",
  "favourited",
] as const;

export const zBookmarkHistoryFieldSchema = z.enum(BOOKMARK_HISTORY_FIELDS);
export type ZBookmarkHistoryField = z.infer<typeof zBookmarkHistoryFieldSchema>;

// Owner-specific state that collaborators must not see. Keep in sync with
// `Bookmark.asZBookmark()` in packages/trpc/models/bookmarks.ts, which hides
// the same fields from non-owners.
export const OWNER_ONLY_HISTORY_FIELDS = [
  "note",
  "archived",
  "favourited",
] as const satisfies readonly ZBookmarkHistoryField[];

// Dates are stored as ISO strings.
export const zBookmarkHistoryValueSchema = z.union([
  z.string(),
  z.boolean(),
  z.null(),
]);
export type ZBookmarkHistoryValue = z.infer<typeof zBookmarkHistoryValueSchema>;

export const zBookmarkHistoryEntrySchema = z.object({
  id: z.string(),
  field: zBookmarkHistoryFieldSchema,
  oldValue: zBookmarkHistoryValueSchema,
  newValue: zBookmarkHistoryValueSchema,
  createdAt: z.date(),
  editor: z.object({
    id: z.string(),
    name: z.string(),
  }),
  // The bookmark's latest edit, which the owner can still roll back. It
  // becomes final when the next edit is made.
  pending: z.boolean(),
});
export type ZBookmarkHistoryEntry = z.infer<typeof zBookmarkHistoryEntrySchema>;

export const zGetBookmarkHistoryResponseSchema = z.object({
  entries: z.array(zBookmarkHistoryEntrySchema),
});
export type ZGetBookmarkHistoryResponse = z.infer<
  typeof zGetBookmarkHistoryResponseSchema
>;
