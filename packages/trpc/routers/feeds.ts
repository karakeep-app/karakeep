import { z } from "zod";

import { FeedQueue } from "@karakeep/shared-server";
import {
  zFeedSchema,
  zImportOpmlSchema,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import { authedProcedure, router } from "../index";
import { Feed } from "../models/feeds";
import { parseOpml } from "../utils/opmlParser";

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
  importOpml: authedProcedure
    .input(zImportOpmlSchema)
    .output(
      z.object({
        imported: z.number(),
        skipped: z.number(),
        failed: z.number(),
        feeds: z.array(zFeedSchema),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { opmlContent, importTags, enabled } = input;

      // Parse OPML file
      const parsedFeeds = parseOpml(opmlContent);

      let imported = 0;
      let skipped = 0;
      let failed = 0;
      const createdFeeds: Feed[] = [];

      // Get existing feeds to check for duplicates
      const existingFeeds = await Feed.getAll(ctx);
      const existingUrls = new Set(
        existingFeeds.map((feed) => feed.asPublicFeed().url.toLowerCase()),
      );

      // Import each feed
      for (const parsedFeed of parsedFeeds) {
        try {
          // Check if feed already exists
          if (existingUrls.has(parsedFeed.xmlUrl.toLowerCase())) {
            skipped++;
            continue;
          }

          // Create new feed
          const feed = await Feed.create(ctx, {
            name: parsedFeed.title,
            url: parsedFeed.xmlUrl,
            enabled: enabled ?? true,
            importTags: importTags ?? false,
          });

          createdFeeds.push(feed);
          existingUrls.add(parsedFeed.xmlUrl.toLowerCase());
          imported++;
        } catch (error) {
          failed++;
          console.error(
            `Failed to import feed ${parsedFeed.title}:`,
            error,
          );
        }
      }

      return {
        imported,
        skipped,
        failed,
        feeds: createdFeeds.map((f) => f.asPublicFeed()),
      };
    }),
});
