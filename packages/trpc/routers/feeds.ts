import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import { FeedQueue } from "@karakeep/shared-server";
import {
  zFeedSchema,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { actorFromContext } from "../lib/actor";
import { FeedsService } from "../models/feeds.service";

const ensureFeedOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { feedId: string };
}>().create(async (opts) => {
  const service = new FeedsService(opts.ctx.db);
  const actor = actorFromContext(opts.ctx);
  const feed = await service.get(actor, opts.input.feedId);

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
      const actor = actorFromContext(ctx);
      return await service.create(actor, input);
    }),
  update: authedProcedure
    .input(zUpdateFeedSchema)
    .output(zFeedSchema)
    .use(ensureFeedOwnership)
    .mutation(async ({ input, ctx }) => {
      const service = new FeedsService(ctx.db);
      return await service.update(ctx.feed, input);
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
      const actor = actorFromContext(ctx);
      const feeds = await service.getAll(actor);
      return { feeds };
    }),
  delete: authedProcedure
    .input(z.object({ feedId: z.string() }))
    .use(ensureFeedOwnership)
    .mutation(async ({ ctx }) => {
      const service = new FeedsService(ctx.db);
      await service.delete(ctx.feed);
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
