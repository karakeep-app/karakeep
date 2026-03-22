import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  DEFAULT_NUM_HIGHLIGHTS_PER_PAGE,
  zGetAllHighlightsResponseSchema,
  zHighlightSchema,
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { HighlightsService } from "../models/highlights.service";
import { ensureBookmarkAccess, ensureBookmarkOwnership } from "./bookmarks";

const ensureHighlightOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { highlightId: string };
}>().create(async (opts) => {
  const service = new HighlightsService(opts.ctx.db);
  const highlight = await service.get(opts.input.highlightId);

  if (highlight.userId !== opts.ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not allowed to access resource",
    });
  }

  return opts.next({
    ctx: {
      ...opts.ctx,
      highlight,
    },
  });
});

export const highlightsAppRouter = router({
  create: authedProcedure
    .input(zNewHighlightSchema)
    .output(zHighlightSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const service = new HighlightsService(ctx.db);
      return await service.create(ctx.user.id, input);
    }),
  getForBookmark: authedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(z.object({ highlights: z.array(zHighlightSchema) }))
    .use(ensureBookmarkAccess)
    .query(async ({ ctx }) => {
      const service = new HighlightsService(ctx.db);
      const highlights = await service.getForBookmark(ctx.bookmark.id);
      return { highlights };
    }),
  get: authedProcedure
    .input(z.object({ highlightId: z.string() }))
    .output(zHighlightSchema)
    .use(ensureHighlightOwnership)
    .query(({ ctx }) => {
      return ctx.highlight;
    }),
  getAll: authedProcedure
    .input(
      z.object({
        cursor: z.any().nullish(),
        limit: z.number().optional().default(DEFAULT_NUM_HIGHLIGHTS_PER_PAGE),
      }),
    )
    .output(zGetAllHighlightsResponseSchema)
    .query(async ({ input, ctx }) => {
      const service = new HighlightsService(ctx.db);
      return await service.getAll(ctx.user.id, input.cursor, input.limit);
    }),
  search: authedProcedure
    .input(
      z.object({
        text: z.string(),
        cursor: zCursorV2.nullish(),
        limit: z.number().optional().default(DEFAULT_NUM_HIGHLIGHTS_PER_PAGE),
      }),
    )
    .output(zGetAllHighlightsResponseSchema)
    .query(async ({ input, ctx }) => {
      const service = new HighlightsService(ctx.db);
      return await service.search(
        ctx.user.id,
        input.text,
        input.cursor,
        input.limit,
      );
    }),
  delete: authedProcedure
    .input(z.object({ highlightId: z.string() }))
    .output(zHighlightSchema)
    .use(ensureHighlightOwnership)
    .mutation(async ({ ctx }) => {
      const service = new HighlightsService(ctx.db);
      return await service.delete(ctx.highlight.id);
    }),
  update: authedProcedure
    .input(zUpdateHighlightSchema)
    .output(zHighlightSchema)
    .use(ensureHighlightOwnership)
    .mutation(async ({ input, ctx }) => {
      const service = new HighlightsService(ctx.db);
      return await service.update(ctx.highlight.id, input);
    }),
});
