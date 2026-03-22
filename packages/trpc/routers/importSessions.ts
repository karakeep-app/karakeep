import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

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
import { ImportSessionsService } from "../models/importSessions.service";

const ensureImportSessionAccess = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { importSessionId: string };
}>().create(async (opts) => {
  const service = new ImportSessionsService(opts.ctx.db);
  const session = await service.get(
    opts.input.importSessionId,
    opts.ctx.user.id,
  );

  return opts.next({
    ctx: {
      ...opts.ctx,
      importSession: session,
    },
  });
});

export const importSessionsRouter = router({
  createImportSession: authedProcedure
    .input(zCreateImportSessionRequestSchema)
    .output(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const service = new ImportSessionsService(ctx.db);
      const session = await service.create(ctx.user.id, input);
      return { id: session.id };
    }),

  getImportSessionStats: authedProcedure
    .input(zGetImportSessionStatsRequestSchema)
    .output(zImportSessionWithStatsSchema)
    .query(async ({ input, ctx }) => {
      const service = new ImportSessionsService(ctx.db);
      return await service.getWithStats(input.importSessionId, ctx.user.id);
    }),

  listImportSessions: authedProcedure
    .input(zListImportSessionsRequestSchema)
    .output(zListImportSessionsResponseSchema)
    .query(async ({ ctx }) => {
      const service = new ImportSessionsService(ctx.db);
      const sessions = await service.listWithStats(ctx.user.id);
      return { sessions };
    }),

  deleteImportSession: authedProcedure
    .input(zDeleteImportSessionRequestSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const service = new ImportSessionsService(ctx.db);
      await service.delete(input.importSessionId, ctx.user.id);
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
      const service = new ImportSessionsService(ctx.db);
      await service.stageBookmarks(ctx.importSession, input.bookmarks);
    }),

  finalizeImportStaging: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .use(ensureImportSessionAccess)
    .mutation(async ({ ctx }) => {
      const service = new ImportSessionsService(ctx.db);
      await service.finalize(ctx.importSession);
    }),

  pauseImportSession: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .use(ensureImportSessionAccess)
    .mutation(async ({ ctx }) => {
      const service = new ImportSessionsService(ctx.db);
      await service.pause(ctx.importSession);
    }),

  resumeImportSession: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .use(ensureImportSessionAccess)
    .mutation(async ({ ctx }) => {
      const service = new ImportSessionsService(ctx.db);
      await service.resume(ctx.importSession);
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
      const service = new ImportSessionsService(ctx.db);
      return await service.getStagingBookmarks(
        ctx.importSession.id,
        input.filter,
        input.cursor,
        input.limit,
      );
    }),
});
