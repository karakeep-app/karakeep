import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@karakeep/db";
import { importSessions, importStagingBookmarks } from "@karakeep/db/schema";
import {
  zCreateImportSessionRequestSchema,
  zDeleteImportSessionRequestSchema,
  zGetImportSessionStatsRequestSchema,
  zImportSessionWithStatsSchema,
  zListImportSessionsRequestSchema,
  zListImportSessionsResponseSchema,
} from "@karakeep/shared/types/importSessions";

import { authedProcedure, router } from "../index";
import { ImportSession } from "../models/importSessions";

export const importSessionsRouter = router({
  createImportSession: authedProcedure
    .input(zCreateImportSessionRequestSchema)
    .output(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const session = await ImportSession.create(ctx, input);
      return { id: session.session.id };
    }),

  getImportSessionStats: authedProcedure
    .input(zGetImportSessionStatsRequestSchema)
    .output(zImportSessionWithStatsSchema)
    .query(async ({ input, ctx }) => {
      const session = await ImportSession.fromId(ctx, input.importSessionId);
      return await session.getWithStats();
    }),

  listImportSessions: authedProcedure
    .input(zListImportSessionsRequestSchema)
    .output(zListImportSessionsResponseSchema)
    .query(async ({ ctx }) => {
      const sessions = await ImportSession.getAllWithStats(ctx);
      return { sessions };
    }),

  deleteImportSession: authedProcedure
    .input(zDeleteImportSessionRequestSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const session = await ImportSession.fromId(ctx, input.importSessionId);
      await session.delete();
      return { success: true };
    }),

  stageImportedBookmark: authedProcedure
    .input(
      z.object({
        importSessionId: z.string(),
        type: z.enum(["link", "text", "asset"]),
        url: z.string().optional(),
        title: z.string().optional(),
        content: z.string().optional(),
        note: z.string().optional(),
        tags: z.array(z.string()).default([]),
        listPaths: z.array(z.string()).default([]),
        sourceAddedAt: z.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Verify session belongs to user and is in staging status
      const session = await db.query.importSessions.findFirst({
        where: and(
          eq(importSessions.id, input.importSessionId),
          eq(importSessions.userId, ctx.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import session not found",
        });
      }

      if (session.status !== "staging") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session not in staging status",
        });
      }

      // Insert into staging table - NO side effects triggered
      await ctx.db.insert(importStagingBookmarks).values({
        importSessionId: input.importSessionId,
        type: input.type,
        url: input.url,
        title: input.title,
        content: input.content,
        note: input.note,
        tags: input.tags,
        listPaths: input.listPaths,
        sourceAddedAt: input.sourceAddedAt,
        status: "pending",
      });
    }),

  finalizeImportStaging: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const session = await db.query.importSessions.findFirst({
        where: and(
          eq(importSessions.id, input.importSessionId),
          eq(importSessions.userId, ctx.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import session not found",
        });
      }

      if (session.status !== "staging") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session not in staging status",
        });
      }

      // Mark session as pending - polling worker will pick it up
      await ctx.db
        .update(importSessions)
        .set({ status: "pending" })
        .where(eq(importSessions.id, input.importSessionId));
    }),

  pauseImportSession: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(importSessions)
        .set({ status: "paused" })
        .where(
          and(
            eq(importSessions.id, input.importSessionId),
            eq(importSessions.userId, ctx.user.id),
            inArray(importSessions.status, ["pending", "running"]),
          ),
        );
    }),

  resumeImportSession: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.query.importSessions.findFirst({
        where: and(
          eq(importSessions.id, input.importSessionId),
          eq(importSessions.userId, ctx.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import session not found",
        });
      }

      if (session.status !== "paused") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session not paused",
        });
      }

      // Mark as pending - polling worker will pick it up
      await ctx.db
        .update(importSessions)
        .set({ status: "pending" })
        .where(eq(importSessions.id, input.importSessionId));
    }),

  getImportSessionResults: authedProcedure
    .input(
      z.object({
        importSessionId: z.string(),
        filter: z
          .enum(["all", "accepted", "rejected", "skipped_duplicate", "pending"])
          .optional(),
        cursor: z.string().optional(),
        limit: z.number().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const session = await db.query.importSessions.findFirst({
        where: and(
          eq(importSessions.id, input.importSessionId),
          eq(importSessions.userId, ctx.user.id),
        ),
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import session not found",
        });
      }

      const results = await ctx.db
        .select()
        .from(importStagingBookmarks)
        .where(
          and(
            eq(importStagingBookmarks.importSessionId, input.importSessionId),
            input.filter && input.filter !== "all"
              ? input.filter === "pending"
                ? eq(importStagingBookmarks.status, "pending")
                : eq(importStagingBookmarks.result, input.filter)
              : undefined,
            input.cursor
              ? gt(importStagingBookmarks.id, input.cursor)
              : undefined,
          ),
        )
        .orderBy(importStagingBookmarks.id)
        .limit(input.limit + 1);

      // Return with pagination info
      const hasMore = results.length > input.limit;
      return {
        items: results.slice(0, input.limit),
        nextCursor: hasMore ? results[input.limit - 1].id : null,
      };
    }),
});
