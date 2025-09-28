import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import {
  bookmarks,
  importSessionBookmarks,
  importSessions,
} from "@karakeep/db/schema";
import { ImportSessionQueue } from "@karakeep/shared-server";
import {
  zAttachBookmarkToSessionRequestSchema,
  zCreateImportSessionRequestSchema,
  zDeleteImportSessionRequestSchema,
  zGetImportSessionStatsRequestSchema,
  zImportSessionWithStatsSchema,
  zListImportSessionsRequestSchema,
  zListImportSessionsResponseSchema,
} from "@karakeep/shared/types/importSessions";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";

async function ensureImportSessionOwnership(
  ctx: AuthedContext,
  importSessionId: string,
) {
  const session = await ctx.db.query.importSessions.findFirst({
    where: eq(importSessions.id, importSessionId),
    columns: {
      userId: true,
    },
  });

  if (!session) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Import session not found",
    });
  }

  if (session.userId !== ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not allowed to access this import session",
    });
  }

  return session;
}

export const importSessionsRouter = router({
  createImportSession: authedProcedure
    .input(zCreateImportSessionRequestSchema)
    .output(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [session] = await ctx.db
        .insert(importSessions)
        .values({
          name: input.name,
          userId: ctx.user.id,
          status: "pending",
        })
        .returning();

      return { id: session.id };
    }),

  attachBookmarkToSession: authedProcedure
    .input(zAttachBookmarkToSessionRequestSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Ensure session ownership
      await ensureImportSessionOwnership(ctx, input.importSessionId);

      // Ensure bookmark ownership
      const bookmark = await ctx.db.query.bookmarks.findFirst({
        where: and(
          eq(bookmarks.id, input.bookmarkId),
          eq(bookmarks.userId, ctx.user.id),
        ),
        columns: {
          id: true,
        },
      });

      if (!bookmark) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bookmark not found",
        });
      }

      // Attach bookmark to session
      await ctx.db
        .insert(importSessionBookmarks)
        .values({
          importSessionId: input.importSessionId,
          bookmarkId: input.bookmarkId,
          status: "pending",
        })
        .onConflictDoNothing();

      return { success: true };
    }),

  getImportSessionStats: authedProcedure
    .input(zGetImportSessionStatsRequestSchema)
    .output(zImportSessionWithStatsSchema)
    .query(async ({ input, ctx }) => {
      // Ensure session ownership
      await ensureImportSessionOwnership(ctx, input.importSessionId);

      const session = await ctx.db.query.importSessions.findFirst({
        where: eq(importSessions.id, input.importSessionId),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import session not found",
        });
      }

      // Get bookmark counts by status
      const statusCounts = await ctx.db
        .select({
          status: importSessionBookmarks.status,
          count: count(),
        })
        .from(importSessionBookmarks)
        .where(
          eq(importSessionBookmarks.importSessionId, input.importSessionId),
        )
        .groupBy(importSessionBookmarks.status);

      const stats = {
        totalBookmarks: 0,
        completedBookmarks: 0,
        failedBookmarks: 0,
        pendingBookmarks: 0,
        processingBookmarks: 0,
      };

      statusCounts.forEach((statusCount) => {
        stats.totalBookmarks += statusCount.count;
        switch (statusCount.status) {
          case "completed":
            stats.completedBookmarks = statusCount.count;
            break;
          case "failed":
            stats.failedBookmarks = statusCount.count;
            break;
          case "pending":
            stats.pendingBookmarks = statusCount.count;
            break;
          case "processing":
            stats.processingBookmarks = statusCount.count;
            break;
        }
      });

      return {
        ...session,
        ...stats,
      };
    }),

  listImportSessions: authedProcedure
    .input(zListImportSessionsRequestSchema)
    .output(zListImportSessionsResponseSchema)
    .query(async ({ input, ctx }) => {
      const sessions = await ctx.db.query.importSessions.findMany({
        where: eq(importSessions.userId, ctx.user.id),
        orderBy: (importSessions, { desc }) => [desc(importSessions.createdAt)],
        limit: input.limit + 1, // Get one extra to determine if there's a next page
        ...(input.cursor ? { offset: parseInt(input.cursor) } : {}),
      });

      const hasNextPage = sessions.length > input.limit;
      const sessionsToReturn = hasNextPage ? sessions.slice(0, -1) : sessions;

      // Get stats for each session
      const sessionsWithStats = await Promise.all(
        sessionsToReturn.map(async (session) => {
          const statusCounts = await ctx.db
            .select({
              status: importSessionBookmarks.status,
              count: count(),
            })
            .from(importSessionBookmarks)
            .where(eq(importSessionBookmarks.importSessionId, session.id))
            .groupBy(importSessionBookmarks.status);

          const stats = {
            totalBookmarks: 0,
            completedBookmarks: 0,
            failedBookmarks: 0,
            pendingBookmarks: 0,
            processingBookmarks: 0,
          };

          statusCounts.forEach((statusCount) => {
            stats.totalBookmarks += statusCount.count;
            switch (statusCount.status) {
              case "completed":
                stats.completedBookmarks = statusCount.count;
                break;
              case "failed":
                stats.failedBookmarks = statusCount.count;
                break;
              case "pending":
                stats.pendingBookmarks = statusCount.count;
                break;
              case "processing":
                stats.processingBookmarks = statusCount.count;
                break;
            }
          });

          return {
            ...session,
            ...stats,
          };
        }),
      );

      const nextCursor = hasNextPage
        ? String(parseInt(input.cursor || "0") + input.limit)
        : null;

      return {
        sessions: sessionsWithStats,
        nextCursor,
      };
    }),

  deleteImportSession: authedProcedure
    .input(zDeleteImportSessionRequestSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Ensure session ownership
      await ensureImportSessionOwnership(ctx, input.importSessionId);

      // Delete the session (cascade will handle the bookmarks)
      const result = await ctx.db
        .delete(importSessions)
        .where(
          and(
            eq(importSessions.id, input.importSessionId),
            eq(importSessions.userId, ctx.user.id),
          ),
        );

      if (result.changes === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import session not found",
        });
      }

      return { success: true };
    }),

  startImportSessionProcessing: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Ensure session ownership
      await ensureImportSessionOwnership(ctx, input.importSessionId);

      // Check if session has bookmarks to process
      const bookmarkCount = await ctx.db
        .select({ count: count() })
        .from(importSessionBookmarks)
        .where(
          eq(importSessionBookmarks.importSessionId, input.importSessionId),
        );

      if (bookmarkCount[0]?.count === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Import session has no bookmarks to process",
        });
      }

      // Update session status to in_progress and enqueue processing
      await ctx.db
        .update(importSessions)
        .set({
          status: "in_progress",
          modifiedAt: new Date(),
        })
        .where(eq(importSessions.id, input.importSessionId));

      // Enqueue the import session for processing
      await ImportSessionQueue.enqueue({
        importSessionId: input.importSessionId,
      });

      return { success: true };
    }),
});
