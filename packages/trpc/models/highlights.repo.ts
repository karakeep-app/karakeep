import type { SQL } from "drizzle-orm";
import { and, desc, eq, like, lt, lte, or } from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import {
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  bookmarkTexts,
  highlights,
} from "@karakeep/db/schema";
import type {
  ZHighlightColor,
  ZHighlightWithBookmark,
} from "@karakeep/shared/types/highlights";
import {
  zHighlightSchema,
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

type Highlight = z.infer<typeof zHighlightSchema>;
interface HighlightsPage {
  highlights: ZHighlightWithBookmark[];
  nextCursor: z.infer<typeof zCursorV2> | null;
}

export class HighlightsRepo {
  constructor(private db: DB) {}

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
        prefix: input.prefix ?? null,
        suffix: input.suffix ?? null,
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
    color?: ZHighlightColor,
  ): Promise<HighlightsPage> {
    return await this.findPage(
      and(
        eq(highlights.userId, userId),
        color ? eq(highlights.color, color) : undefined,
      ),
      cursor,
      limit,
    );
  }

  async search(
    userId: string,
    searchText: string,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
    color?: ZHighlightColor,
  ): Promise<HighlightsPage> {
    const searchPattern = `%${searchText}%`;
    return await this.findPage(
      and(
        eq(highlights.userId, userId),
        color ? eq(highlights.color, color) : undefined,
        or(
          like(highlights.text, searchPattern),
          like(highlights.note, searchPattern),
        ),
      ),
      cursor,
      limit,
    );
  }

  private async findPage(
    where: SQL | undefined,
    cursor: z.infer<typeof zCursorV2> | null | undefined,
    limit: number,
  ): Promise<HighlightsPage> {
    const results = await this.db
      .select({
        highlight: highlights,
        bookmarkTitle: bookmarks.title,
        linkTitle: bookmarkLinks.title,
        linkUrl: bookmarkLinks.url,
        textSourceUrl: bookmarkTexts.sourceUrl,
        assetFileName: bookmarkAssets.fileName,
        assetSourceUrl: bookmarkAssets.sourceUrl,
      })
      .from(highlights)
      .innerJoin(bookmarks, eq(highlights.bookmarkId, bookmarks.id))
      .leftJoin(bookmarkLinks, eq(bookmarkLinks.id, bookmarks.id))
      .leftJoin(bookmarkTexts, eq(bookmarkTexts.id, bookmarks.id))
      .leftJoin(bookmarkAssets, eq(bookmarkAssets.id, bookmarks.id))
      .where(
        and(
          where,
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
      )
      .orderBy(desc(highlights.createdAt), desc(highlights.id))
      .limit(limit + 1);

    let nextCursor: z.infer<typeof zCursorV2> | null = null;
    if (results.length > limit) {
      const nextItem = results.pop()!;
      nextCursor = {
        id: nextItem.highlight.id,
        createdAt: nextItem.highlight.createdAt,
      };
    }

    return {
      // These follow getBookmarkTitle and getSourceUrl from bookmarkUtils.
      highlights: results.map((row) => ({
        ...row.highlight,
        bookmark: {
          title:
            row.bookmarkTitle ||
            row.linkTitle ||
            row.linkUrl ||
            row.assetFileName ||
            null,
          url: row.linkUrl ?? row.textSourceUrl ?? row.assetSourceUrl ?? null,
        },
      })),
      nextCursor,
    };
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
