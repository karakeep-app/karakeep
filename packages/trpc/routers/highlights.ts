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
import { HighlightsRepo } from "../models/highlights.repo";
import { ensureBookmarkAccess, ensureBookmarkOwnership } from "./bookmarks";

const ensureHighlightOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { highlightId: string };
}>().create(async (opts) => {
  const repo = new HighlightsRepo(opts.ctx.db);
  const highlight = await repo.get(opts.input.highlightId);

  if (!highlight) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Highlight not found",
    });
  }

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
      const repo = new HighlightsRepo(ctx.db);
      return await repo.create(ctx.user.id, input);
    }),
  getForBookmark: authedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(z.object({ highlights: z.array(zHighlightSchema) }))
    .use(ensureBookmarkAccess)
    .query(async ({ ctx }) => {
      const repo = new HighlightsRepo(ctx.db);
      const highlights = await repo.getForBookmark(ctx.bookmark.id);
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
      const repo = new HighlightsRepo(ctx.db);
      return await repo.getAll(ctx.user.id, input.cursor, input.limit);
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
      const repo = new HighlightsRepo(ctx.db);
      return await repo.search(
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
      const repo = new HighlightsRepo(ctx.db);
      const deleted = await repo.delete(ctx.highlight.id);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return deleted;
    }),
  update: authedProcedure
    .input(zUpdateHighlightSchema)
    .output(zHighlightSchema)
    .use(ensureHighlightOwnership)
    .mutation(async ({ input, ctx }) => {
      const repo = new HighlightsRepo(ctx.db);
      const updated = await repo.update(ctx.highlight.id, input);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return updated;
    }),
});
