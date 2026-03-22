import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { z } from "zod";

import { FeedQueue } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import {
  zFeedSchema,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { FeedsRepo } from "../models/feeds.repo";

const ensureFeedOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { feedId: string };
}>().create(async (opts) => {
  const repo = new FeedsRepo(opts.ctx.db);
  const feed = await repo.get(opts.input.feedId);

  if (!feed) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Feed not found",
    });
  }

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
      const repo = new FeedsRepo(ctx.db);

      const feedCount = await repo.countByUser(ctx.user.id);
      const maxFeeds = serverConfig.feeds.maxRssFeedsPerUser;
      if (feedCount >= maxFeeds) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum number of RSS feeds (${maxFeeds}) reached`,
        });
      }

      return await repo.create(ctx.user.id, input);
    }),
  update: authedProcedure
    .input(zUpdateFeedSchema)
    .output(zFeedSchema)
    .use(ensureFeedOwnership)
    .mutation(async ({ input, ctx }) => {
      const repo = new FeedsRepo(ctx.db);
      const updated = await repo.update(ctx.feed.id, input);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return updated;
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
      const repo = new FeedsRepo(ctx.db);
      const feeds = await repo.getAll(ctx.user.id);
      return { feeds };
    }),
  delete: authedProcedure
    .input(z.object({ feedId: z.string() }))
    .use(ensureFeedOwnership)
    .mutation(async ({ ctx }) => {
      const repo = new FeedsRepo(ctx.db);
      const deleted = await repo.delete(ctx.feed.id);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
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
