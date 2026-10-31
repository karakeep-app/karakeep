import {
  and,
  desc,
  eq,
  isNotNull,
  like,
  lt,
  lte,
  notInArray,
  or,
} from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import { bookmarks, highlights } from "@karakeep/db/schema";
import {
  zHighlightSchema,
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

type Highlight = z.infer<typeof zHighlightSchema>;

export class HighlightsRepo {
  constructor(private db: DB) {}

  private notInTrash() {
    return notInArray(
      highlights.bookmarkId,
      this.db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(isNotNull(bookmarks.deleteAt)),
    );
  }

  async get(id: string): Promise<Highlight | null> {
    const highlight = await this.db.query.highlights.findFirst({
      where: eq(highlights.id, id),
    });
    return highlight ?? null;
  }

  async create(
    userId: string,
    input: z.infer<typeof zNewHighlightSchema>,
  ): Promise<Highlight> {
    const [result] = await this.db
      .insert(highlights)
      .values({
        bookmarkId: input.bookmarkId,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        color: input.color,
        text: input.text,
        note: input.note,
        userId,
      })
      .returning();

    return result;
  }

  async getForBookmark(bookmarkId: string): Promise<Highlight[]> {
    return await this.db.query.highlights.findMany({
      where: eq(highlights.bookmarkId, bookmarkId),
      orderBy: [desc(highlights.createdAt), desc(highlights.id)],
    });
  }

  async getAll(
    userId: string,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: Highlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    const results = await this.db.query.highlights.findMany({
      where: and(
        eq(highlights.userId, userId),
        this.notInTrash(),
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

    return { highlights: results, nextCursor };
  }

  async search(
    userId: string,
    searchText: string,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: Highlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    const searchPattern = `%${searchText}%`;
    const results = await this.db.query.highlights.findMany({
      where: and(
        eq(highlights.userId, userId),
        this.notInTrash(),
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

    return { highlights: results, nextCursor };
  }

  async delete(id: string): Promise<Highlight | null> {
    const result = await this.db
      .delete(highlights)
      .where(eq(highlights.id, id))
      .returning();

    return result[0] ?? null;
  }

  async update(
    id: string,
    input: z.infer<typeof zUpdateHighlightSchema>,
  ): Promise<Highlight | null> {
    const result = await this.db
      .update(highlights)
      .set({
        color: input.color,
        note: input.note,
      })
      .where(eq(highlights.id, id))
      .returning();

    return result[0] ?? null;
  }
}
