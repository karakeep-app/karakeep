import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import {
  zCreateTagRequestSchema,
  zGetTagResponseSchema,
  zTagBasicSchema,
  zTagListResponseSchema,
  zTagListValidatedRequestSchema,
  zUpdateTagRequestSchema,
} from "@karakeep/shared/types/tags";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { Tag } from "../models/tags";

export const ensureTagOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { tagId: string };
}>().create(async (opts) => {
  const tag = await Tag.fromId(opts.ctx, opts.input.tagId);
  return opts.next({
    ctx: {
      ...opts.ctx,
      tag,
    },
  });
});

export const tagsAppRouter = router({
  create: authedProcedure
    .input(zCreateTagRequestSchema)
    .output(zTagBasicSchema)
    .mutation(async ({ input, ctx }) => {
      const tag = await Tag.create(ctx, input);
      return tag.asBasicTag();
    }),

  get: authedProcedure
    .input(
      z.object({
        tagId: z.string(),
      }),
    )
    .output(zGetTagResponseSchema)
    .use(ensureTagOwnership)
    .query(async ({ ctx }) => {
      return await ctx.tag.getStats();
    }),
  delete: authedProcedure
    .input(
      z.object({
        tagId: z.string(),
      }),
    )
    .use(ensureTagOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.tag.delete();
    }),
  deleteUnused: authedProcedure
    .output(
      z.object({
        deletedTags: z.number(),
      }),
    )
    .mutation(async ({ ctx }) => {
      const deletedCount = await Tag.deleteUnused(ctx);
      return { deletedTags: deletedCount };
    }),
  update: authedProcedure
    .input(zUpdateTagRequestSchema)
    .output(zTagBasicSchema)
    .use(ensureTagOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.tag.update(input);
      return ctx.tag.asBasicTag();
    }),
  merge: authedProcedure
    .input(
      z.object({
        intoTagId: z.string(),
        fromTagIds: z.array(z.string()),
      }),
    )
    .output(
      z.object({
        mergedIntoTagId: z.string(),
        deletedTags: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return await Tag.merge(ctx, input);
    }),
  list: authedProcedure
    .input(
      // TODO: Remove the optional and default once the next release is out.
      zTagListValidatedRequestSchema
        .optional()
        .default(zTagListValidatedRequestSchema.parse({})),
    )
    .output(zTagListResponseSchema)
    .query(async ({ ctx, input }) => {
      return await Tag.getAll(ctx, {
        nameContains: input.nameContains,
        attachedBy: input.attachedBy,
        sortBy: input.sortBy,
        pagination: input.limit
          ? {
              page: input.cursor?.page ?? 0,
              limit: input.limit,
            }
          : undefined,
      });
    }),
});
