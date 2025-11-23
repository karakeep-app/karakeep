import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, lt, lte, or } from "drizzle-orm";
import { z } from "zod";

import { highlights } from "@karakeep/db/schema";
import {
  zHighlightSchema,
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import { AuthedContext } from "..";
import { BareBookmark } from "./bookmarks";

export class Highlight {
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
    bookmark: BareBookmark,
  ): Promise<Highlight[]> {
    const results = await ctx.db.query.highlights.findMany({
      where: eq(highlights.bookmarkId, bookmark.id),
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

  static async search(
    ctx: AuthedContext,
    searchText: string,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: Highlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    const searchPattern = `%${searchText}%`;
    const results = await ctx.db.query.highlights.findMany({
      where: and(
        eq(highlights.userId, ctx.user.id),
        or(
          like(highlights.text, searchPattern),
          like(highlights.note, searchPattern),
        ),
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
        note: input.note,
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
