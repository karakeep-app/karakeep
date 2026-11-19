import { z } from "zod";
import { zCursorV2 } from "./pagination";
// Keep API visibility and physical expiry cleanup on the same retention window.
export const BOOKMARK_HISTORY_RETENTION_DAYS = 90;
/** One changed field; values may be scalars or snapshots of related tags, lists, or files. */
export const zBookmarkHistoryChangeSchema = z.object({
  field: z.string(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});
export type BookmarkHistoryChange = z.infer<
  typeof zBookmarkHistoryChangeSchema
>;
/**
 * Shared response contract for retained audit events. Ownership outlives a
 * deleted bookmark; actorKind survives even if the actor account is removed.
 */
export const zBookmarkHistoryEventSchema = z.object({
  id: z.string(),
  bookmarkId: z.string(),
  ownerId: z.string(),
  actorId: z.string().nullable(),
  actorKind: z.enum(["user", "apiKey", "system"]),
  createdAt: z.date(),
  type: z.enum(["edit", "deleted"]),
  title: z.string().nullable(),
  changes: z.array(zBookmarkHistoryChangeSchema),
});
/** Cursor response shared by per-item history and the deleted-item listing. */
export const zBookmarkHistoryPageSchema = z.object({
  events: z.array(zBookmarkHistoryEventSchema),
  nextCursor: zCursorV2.nullable(),
});
