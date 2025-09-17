import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { rssFeedsTable } from "@karakeep/db/schema";
import {
  zFeedSchema,
  zNewFeedSchema,
  zUpdateFeedSchema,
} from "@karakeep/shared/types/feeds";

import { AuthedContext } from "..";
import { PrivacyAware } from "./privacy";

export class Feed implements PrivacyAware {
  constructor(
    protected ctx: AuthedContext,
    private feed: typeof rssFeedsTable.$inferSelect,
  ) {}

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
    const [result] = await ctx.db
      .insert(rssFeedsTable)
      .values({
        name: input.name,
        url: input.url,
        userId: ctx.user.id,
        enabled: input.enabled,
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

  ensureCanAccess(ctx: AuthedContext): void {
    if (this.feed.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }
  }

  async delete(): Promise<void> {
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

  async update(input: z.infer<typeof zUpdateFeedSchema>): Promise<void> {
    const result = await this.ctx.db
      .update(rssFeedsTable)
      .set({
        name: input.name,
        url: input.url,
        enabled: input.enabled,
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

    this.feed = result[0];
  }

  asPublicFeed(): z.infer<typeof zFeedSchema> {
    return this.feed;
  }
}
