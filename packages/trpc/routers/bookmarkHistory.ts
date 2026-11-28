import {
  BOOKMARK_HISTORY_RETENTION_DAYS,
  zBookmarkHistoryPageSchema,
} from "@karakeep/shared/types/bookmarkHistory";
import { and, desc, eq, gt, lt, or } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { bookmarkHistory, bookmarks } from "@karakeep/db/schema";
import { zCursorV2 } from "@karakeep/shared/types/pagination";
import { createScopedAuthedProcedure, router } from "../index";
// Bound page sizes so a history request cannot load an entire audit stream at once.
const input = z.object({
  cursor: zCursorV2.nullish(),
  limit: z.number().int().min(1).max(100).default(20),
});
// API keys need bookmark-read scope; each query also checks the requesting owner.
const historyProcedure = createScopedAuthedProcedure("bookmarks");
export const bookmarkHistoryRouter = router({
  // Read a live or deleted item's private history. Shared-list visibility does
  // not grant access to historical personal notes or the owner's private state.
  getHistory: historyProcedure
    .input(input.extend({ bookmarkId: z.string() }))
    .output(
      zBookmarkHistoryPageSchema.extend({
        title: z.string().nullable(),
        deleted: z.boolean(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Enforce retention at read time even if the maintenance worker is delayed.
      const cutoff = new Date(
        Date.now() - BOOKMARK_HISTORY_RETENTION_DAYS * 86400000,
      );
      const item = await ctx.db.query.bookmarks.findFirst({
        where: and(
          eq(bookmarks.id, input.bookmarkId),
          eq(bookmarks.userId, ctx.user.id),
        ),
      });
      // After deletion the live bookmark cannot authorize a request. Only an
      // unexpired deletion event belonging to this user can identify the stream.
      const deletion = item
        ? undefined
        : await ctx.db.query.bookmarkHistory.findFirst({
            where: and(
              eq(bookmarkHistory.bookmarkId, input.bookmarkId),
              eq(bookmarkHistory.ownerId, ctx.user.id),
              eq(bookmarkHistory.type, "deleted"),
              gt(bookmarkHistory.createdAt, cutoff),
            ),
          });
      if (!item && !deletion) throw new TRPCError({ code: "NOT_FOUND" });
      // Timestamp plus ID provides deterministic newest-first pagination when
      // multiple events share a timestamp. The extra row indicates another page.
      const events = await ctx.db
        .select()
        .from(bookmarkHistory)
        .where(
          and(
            eq(bookmarkHistory.bookmarkId, input.bookmarkId),
            eq(bookmarkHistory.ownerId, ctx.user.id),
            gt(bookmarkHistory.createdAt, cutoff),
            input.cursor
              ? or(
                  lt(bookmarkHistory.createdAt, input.cursor.createdAt),
                  and(
                    eq(bookmarkHistory.createdAt, input.cursor.createdAt),
                    lt(bookmarkHistory.id, input.cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(bookmarkHistory.createdAt), desc(bookmarkHistory.id))
        .limit(input.limit + 1);
      const more = events.length > input.limit;
      if (more) events.pop();
      const last = events[events.length - 1];
      return {
        title: item?.title ?? deletion?.title ?? null,
        deleted: !item,
        events,
        nextCursor:
          more && last ? { id: last.id, createdAt: last.createdAt } : null,
      };
    }),
  // Deletion events double as the owner's deleted-item index; no live bookmark
  // join is possible, and snapshots remain useful after related data is removed.
  getDeletedHistory: historyProcedure
    .input(input)
    .output(zBookmarkHistoryPageSchema)
    .query(async ({ ctx, input }) => {
      const events = await ctx.db
        .select()
        .from(bookmarkHistory)
        .where(
          and(
            eq(bookmarkHistory.ownerId, ctx.user.id),
            eq(bookmarkHistory.type, "deleted"),
            gt(
              bookmarkHistory.createdAt,
              new Date(Date.now() - BOOKMARK_HISTORY_RETENTION_DAYS * 86400000),
            ),
            input.cursor
              ? or(
                  lt(bookmarkHistory.createdAt, input.cursor.createdAt),
                  and(
                    eq(bookmarkHistory.createdAt, input.cursor.createdAt),
                    lt(bookmarkHistory.id, input.cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(bookmarkHistory.createdAt), desc(bookmarkHistory.id))
        .limit(input.limit + 1);
      const more = events.length > input.limit;
      if (more) events.pop();
      const last = events[events.length - 1];
      return {
        events,
        nextCursor:
          more && last ? { id: last.id, createdAt: last.createdAt } : null,
      };
    }),
});
