import { z } from "zod";

import {
  DEFAULT_NUM_HIGHLIGHTS_PER_PAGE,
  zGetAllHighlightsResponseSchema,
  zHighlightSchema,
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import { authedProcedure, router } from "../index";
import { Highlight } from "../models/highlights";
import { ensureBookmarkAccess, ensureBookmarkOwnership } from "./bookmarks";

export const highlightsAppRouter = router({
  create: authedProcedure
    .input(zNewHighlightSchema)
    .output(zHighlightSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const highlight = await Highlight.create(ctx, input);
      return highlight.asPublicHighlight();
    }),
  getForBookmark: authedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(z.object({ highlights: z.array(zHighlightSchema) }))
    .use(ensureBookmarkAccess)
    .query(async ({ ctx }) => {
      const highlights = await Highlight.getForBookmark(ctx, ctx.bookmark);
      return { highlights: highlights.map((h) => h.asPublicHighlight()) };
    }),
  get: authedProcedure
    .input(z.object({ highlightId: z.string() }))
    .output(zHighlightSchema)
    .query(async ({ input, ctx }) => {
      const highlight = await Highlight.fromId(ctx, input.highlightId);
      return highlight.asPublicHighlight();
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
      const result = await Highlight.getAll(ctx, input.cursor, input.limit);
      return {
        highlights: result.highlights.map((h) => h.asPublicHighlight()),
        nextCursor: result.nextCursor,
      };
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
      const result = await Highlight.search(
        ctx,
        input.text,
        input.cursor,
        input.limit,
      );
      return {
        highlights: result.highlights.map((h) => h.asPublicHighlight()),
        nextCursor: result.nextCursor,
      };
    }),
  delete: authedProcedure
    .input(z.object({ highlightId: z.string() }))
    .output(zHighlightSchema)
    .mutation(async ({ input, ctx }) => {
      const highlight = await Highlight.fromId(ctx, input.highlightId);
      return await highlight.delete();
    }),
  update: authedProcedure
    .input(zUpdateHighlightSchema)
    .output(zHighlightSchema)
    .mutation(async ({ input, ctx }) => {
      const highlight = await Highlight.fromId(ctx, input.highlightId);
      await highlight.update(input);
      return highlight.asPublicHighlight();
    }),
});
