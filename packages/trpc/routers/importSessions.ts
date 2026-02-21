import { experimental_trpcMiddleware } from "@trpc/server";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { importStagingBookmarks } from "@karakeep/db/schema";
import {
  zCreateImportSessionRequestSchema,
  zDeleteImportSessionRequestSchema,
  zGetImportSessionStatsRequestSchema,
  zImportSessionWithStatsSchema,
  zListImportSessionsRequestSchema,
  zListImportSessionsResponseSchema,
} from "@karakeep/shared/types/importSessions";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { ImportSession } from "../models/importSessions";

const ensureImportSessionAccess = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { importSessionId: string };
}>().create(async (opts) => {
  const importSession = await ImportSession.fromId(
    opts.ctx,
    opts.input.importSessionId,
  );
  return opts.next({
    ctx: {
      ...opts.ctx,
      importSession,
    },
  });
});

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

  stageImportedBookmarks: authedProcedure
    .input(
      z.object({
        importSessionId: z.string(),
        bookmarks: z
          .array(
            z.object({
              type: z.enum(["link", "text", "asset"]),
              url: z.string().optional(),
              title: z.string().optional(),
              content: z.string().optional(),
              note: z.string().optional(),
              tags: z.array(z.string()).default([]),
              listIds: z.array(z.string()).default([]),
              sourceAddedAt: z.date().optional(),
            }),
          )
          .max(50),
      }),
    )
    .use(ensureImportSessionAccess)
    .mutation(async ({ input, ctx }) => {
      await ctx.importSession.stageBookmarks(input.bookmarks);
    }),

  finalizeImportStaging: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .use(ensureImportSessionAccess)
    .mutation(async ({ ctx }) => {
      await ctx.importSession.finalize();
    }),

  pauseImportSession: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .use(ensureImportSessionAccess)
    .mutation(async ({ ctx }) => {
      await ctx.importSession.pause();
    }),

  resumeImportSession: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .use(ensureImportSessionAccess)
    .mutation(async ({ ctx }) => {
      await ctx.importSession.resume();
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
    .use(ensureImportSessionAccess)
    .query(async ({ ctx, input }) => {
      const results = await ctx.db
        .select()
        .from(importStagingBookmarks)
        .where(
          and(
            eq(
              importStagingBookmarks.importSessionId,
              ctx.importSession.session.id,
            ),
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
