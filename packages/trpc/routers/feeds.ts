import { z } from "zod";

import { FeedQueue } from "@karakeep/shared-server";
import {
  zFeedSchema,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import { authedProcedure, router } from "../index";
import { Feed } from "../models/feeds";

export const feedsAppRouter = router({
  create: authedProcedure
    .input(zNewFeedSchema)
    .output(zFeedSchema)
    .mutation(async ({ input, ctx }) => {
      const feed = await Feed.create(ctx, input);
      return feed.asPublicFeed();
    }),
  update: authedProcedure
    .input(zUpdateFeedSchema)
    .output(zFeedSchema)
    .mutation(async ({ input, ctx }) => {
      const feed = await Feed.fromId(ctx, input.feedId);
      await feed.update(input);
      return feed.asPublicFeed();
    }),
  get: authedProcedure
    .input(
      z.object({
        feedId: z.string(),
      }),
    )
    .output(zFeedSchema)
    .query(async ({ ctx, input }) => {
      const feed = await Feed.fromId(ctx, input.feedId);
      return feed.asPublicFeed();
    }),
  list: authedProcedure
    .output(z.object({ feeds: z.array(zFeedSchema) }))
    .query(async ({ ctx }) => {
      const feeds = await Feed.getAll(ctx);
      return { feeds: feeds.map((f) => f.asPublicFeed()) };
    }),
  delete: authedProcedure
    .input(
      z.object({
        feedId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const feed = await Feed.fromId(ctx, input.feedId);
      await feed.delete();
    }),
  fetchNow: authedProcedure
    .input(z.object({ feedId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await Feed.fromId(ctx, input.feedId);
      await FeedQueue.enqueue({
        feedId: input.feedId,
      });
    }),
});
