import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { z } from "zod";

import { FeedQueue } from "@karakeep/shared-server";
import {
  zFeedSchema,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { FeedsService } from "../models/feeds.service";

const ensureFeedOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { feedId: string };
}>().create(async (opts) => {
  const service = new FeedsService(opts.ctx.db);
  const feed = await service.get(opts.input.feedId);

  if (feed.userId !== opts.ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not allowed to access resource",
    });
  }

  return opts.next({
    ctx: {
      ...opts.ctx,
      feed,
    },
  });
});

export const feedsAppRouter = router({
  create: authedProcedure
    .input(zNewFeedSchema)
    .output(zFeedSchema)
    .mutation(async ({ input, ctx }) => {
      const service = new FeedsService(ctx.db);
      return await service.create(ctx.user.id, input);
    }),
  update: authedProcedure
    .input(zUpdateFeedSchema)
    .output(zFeedSchema)
    .use(ensureFeedOwnership)
    .mutation(async ({ input, ctx }) => {
      const service = new FeedsService(ctx.db);
      return await service.update(ctx.feed.id, input);
    }),
  get: authedProcedure
    .input(z.object({ feedId: z.string() }))
    .output(zFeedSchema)
    .use(ensureFeedOwnership)
    .query(({ ctx }) => {
      return ctx.feed;
    }),
  list: authedProcedure
    .output(z.object({ feeds: z.array(zFeedSchema) }))
    .query(async ({ ctx }) => {
      const service = new FeedsService(ctx.db);
      const feeds = await service.getAll(ctx.user.id);
      return { feeds };
    }),
  delete: authedProcedure
    .input(z.object({ feedId: z.string() }))
    .use(ensureFeedOwnership)
    .mutation(async ({ ctx }) => {
      const service = new FeedsService(ctx.db);
      await service.delete(ctx.feed.id);
    }),
  fetchNow: authedProcedure
    .input(z.object({ feedId: z.string() }))
    .use(ensureFeedOwnership)
    .mutation(async ({ ctx }) => {
      await FeedQueue.enqueue(
        {
          feedId: ctx.feed.id,
        },
        {
          groupId: ctx.user.id,
        },
      );
    }),
});
