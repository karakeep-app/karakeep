import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt, lte, or } from "drizzle-orm";
import { z } from "zod";

import { highlights } from "@karakeep/db/schema";
import {
  zHighlightSchema,
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import { AuthedContext } from "..";
import { PrivacyAware } from "./privacy";

export class Highlight implements PrivacyAware {
  constructor(
    protected ctx: AuthedContext,
    private highlight: typeof highlights.$inferSelect,
  ) {}

  static async fromId(ctx: AuthedContext, id: string): Promise<Highlight> {
    const highlight = await ctx.db.query.highlights.findFirst({
      where: eq(highlights.id, id),
    });

    if (!highlight) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Highlight not found",
      });
    }

    // If it exists but belongs to another user, throw forbidden error
    if (highlight.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }

    return new Highlight(ctx, highlight);
  }

  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zNewHighlightSchema>,
  ): Promise<Highlight> {
    const [result] = await ctx.db
      .insert(highlights)
      .values({
        bookmarkId: input.bookmarkId,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        color: input.color,
        text: input.text,
        note: input.note,
        userId: ctx.user.id,
      })
      .returning();

    return new Highlight(ctx, result);
  }

  static async getForBookmark(
    ctx: AuthedContext,
    bookmarkId: string,
  ): Promise<Highlight[]> {
    const results = await ctx.db.query.highlights.findMany({
      where: and(
        eq(highlights.bookmarkId, bookmarkId),
        eq(highlights.userId, ctx.user.id),
      ),
      orderBy: [desc(highlights.createdAt), desc(highlights.id)],
    });

    return results.map((h) => new Highlight(ctx, h));
  }

  static async getAll(
    ctx: AuthedContext,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: Highlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    const results = await ctx.db.query.highlights.findMany({
      where: and(
        eq(highlights.userId, ctx.user.id),
        cursor
          ? or(
              lt(highlights.createdAt, cursor.createdAt),
              and(
                eq(highlights.createdAt, cursor.createdAt),
                lte(highlights.id, cursor.id),
              ),
            )
          : undefined,
      ),
      limit: limit + 1,
      orderBy: [desc(highlights.createdAt), desc(highlights.id)],
    });

    let nextCursor: z.infer<typeof zCursorV2> | null = null;
    if (results.length > limit) {
      const nextItem = results.pop()!;
      nextCursor = {
        id: nextItem.id,
        createdAt: nextItem.createdAt,
      };
    }

    return {
      highlights: results.map((h) => new Highlight(ctx, h)),
      nextCursor,
    };
  }

  ensureCanAccess(ctx: AuthedContext): void {
    if (this.highlight.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }
  }

  async delete(): Promise<z.infer<typeof zHighlightSchema>> {
    const result = await this.ctx.db
      .delete(highlights)
      .where(
        and(
          eq(highlights.id, this.highlight.id),
          eq(highlights.userId, this.ctx.user.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    return result[0];
  }

  async update(input: z.infer<typeof zUpdateHighlightSchema>): Promise<void> {
    const result = await this.ctx.db
      .update(highlights)
      .set({
        color: input.color,
      })
      .where(
        and(
          eq(highlights.id, this.highlight.id),
          eq(highlights.userId, this.ctx.user.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    this.highlight = result[0];
  }

  asPublicHighlight(): z.infer<typeof zHighlightSchema> {
    return this.highlight;
  }
}
