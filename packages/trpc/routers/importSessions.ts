import { z } from "zod";

import {
  zAttachBookmarkToSessionRequestSchema,
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

  attachBookmarkToSession: authedProcedure
    .input(zAttachBookmarkToSessionRequestSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const session = await ImportSession.fromId(ctx, input.importSessionId);
      await session.attachBookmark(input);
      return { success: true };
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
    .query(async ({ input, ctx }) => {
      return await ImportSession.getAllWithPagination(ctx, {
        limit: input.limit,
        cursor: input.cursor,
      });
    }),

  deleteImportSession: authedProcedure
    .input(zDeleteImportSessionRequestSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const session = await ImportSession.fromId(ctx, input.importSessionId);
      await session.delete();
      return { success: true };
    }),

  startImportSessionProcessing: authedProcedure
    .input(z.object({ importSessionId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const session = await ImportSession.fromId(ctx, input.importSessionId);
      await session.startProcessing();
      return { success: true };
    }),
});
