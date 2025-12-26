import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { rssFeedsTable } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import {
  zFeedSchema,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import { AuthedContext } from "..";
import { HasAccess, VerifiedResource } from "../lib/privacy";

/**
 * Privacy-safe Feed model using VerifiedResource pattern.
 *
 * Feeds are always owned by a single user (no sharing).
 * All verified feeds have "owner" access level.
 */
export class Feed extends VerifiedResource<
  typeof rssFeedsTable.$inferSelect,
  AuthedContext
> {
  protected constructor(
    ctx: AuthedContext,
    feed: typeof rssFeedsTable.$inferSelect,
  ) {
    // Feeds are always owner-only (no collaboration)
    super(ctx, feed, "owner");
  }

  protected get feed() {
    return this.data;
  }

  get id() {
    return this.feed.id;
  }

  static async fromId(ctx: AuthedContext, id: string): Promise<Feed> {
    const feed = await ctx.db.query.rssFeedsTable.findFirst({
      where: eq(rssFeedsTable.id, id),
    });

    if (!feed) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Feed not found",
      });
    }

    // If it exists but belongs to another user, throw forbidden error
    if (feed.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }

    return new Feed(ctx, feed);
  }

  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zNewFeedSchema>,
  ): Promise<Feed> {
    // Check if user has reached the maximum number of feeds
    const [feedCount] = await ctx.db
      .select({ count: count() })
      .from(rssFeedsTable)
      .where(eq(rssFeedsTable.userId, ctx.user.id));

    const maxFeeds = serverConfig.feeds.maxRssFeedsPerUser;
    if (feedCount.count >= maxFeeds) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Maximum number of RSS feeds (${maxFeeds}) reached`,
      });
    }

    const [result] = await ctx.db
      .insert(rssFeedsTable)
      .values({
        name: input.name,
        url: input.url,
        userId: ctx.user.id,
        enabled: input.enabled,
        importTags: input.importTags ?? false,
      })
      .returning();

    return new Feed(ctx, result);
  }

  static async getAll(ctx: AuthedContext): Promise<Feed[]> {
    const feeds = await ctx.db.query.rssFeedsTable.findMany({
      where: eq(rssFeedsTable.userId, ctx.user.id),
    });

    return feeds.map((f) => new Feed(ctx, f));
  }

  /**
   * Delete this feed.
   * TYPE CONSTRAINT: Requires owner access (always satisfied for feeds).
   */
  async delete(this: Feed & HasAccess<"owner">): Promise<void> {
    const res = await this.ctx.db
      .delete(rssFeedsTable)
      .where(
        and(
          eq(rssFeedsTable.id, this.feed.id),
          eq(rssFeedsTable.userId, this.ctx.user.id),
        ),
      );

    if (res.changes === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
  }

  /**
   * Update this feed.
   * TYPE CONSTRAINT: Requires owner access (always satisfied for feeds).
   */
  async update(
    this: Feed & HasAccess<"owner">,
    input: z.infer<typeof zUpdateFeedSchema>,
  ): Promise<void> {
    const result = await this.ctx.db
      .update(rssFeedsTable)
      .set({
        name: input.name,
        url: input.url,
        enabled: input.enabled,
        importTags: input.importTags,
      })
      .where(
        and(
          eq(rssFeedsTable.id, this.feed.id),
          eq(rssFeedsTable.userId, this.ctx.user.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    // Update internal state - use Object.assign to preserve readonly
    Object.assign(this.data, result[0]);
  }

  asPublicFeed(): z.infer<typeof zFeedSchema> {
    return this.feed;
  }
}
