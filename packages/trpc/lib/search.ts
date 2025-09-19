import {
  and,
  eq,
  exists,
  gt,
  gte,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notExists,
  notLike,
  or,
} from "drizzle-orm";

import {
  bookmarkAssets,
  bookmarkLinks,
  bookmarkLists,
  bookmarks,
  bookmarksInLists,
  bookmarkTags,
  rssFeedImportsTable,
  rssFeedsTable,
  tagsOnBookmarks,
} from "@karakeep/db/schema";
import { Matcher } from "@karakeep/shared/types/search";
import { toAbsoluteDate } from "@karakeep/shared/utils/relativeDateUtils";

import { AuthedContext } from "..";

interface BookmarkQueryReturnType {
  id: string;
}

function intersect(
  vals: BookmarkQueryReturnType[][],
): BookmarkQueryReturnType[] {
  if (!vals || vals.length === 0) {
    return [];
  }

  if (vals.length === 1) {
    return [...vals[0]];
  }

  const countMap = new Map<string, number>();
  const map = new Map<string, BookmarkQueryReturnType>();

  for (const arr of vals) {
    for (const item of arr) {
      countMap.set(item.id, (countMap.get(item.id) ?? 0) + 1);
      map.set(item.id, item);
    }
  }

  const result: BookmarkQueryReturnType[] = [];
  for (const [id, count] of countMap) {
    if (count === vals.length) {
      result.push(map.get(id)!);
    }
  }

  return result;
}

function union(vals: BookmarkQueryReturnType[][]): BookmarkQueryReturnType[] {
  if (!vals || vals.length === 0) {
    return [];
  }

  const uniqueIds = new Set<string>();
  const map = new Map<string, BookmarkQueryReturnType>();
  for (const arr of vals) {
    for (const item of arr) {
      uniqueIds.add(item.id);
      map.set(item.id, item);
    }
  }

  const result: BookmarkQueryReturnType[] = [];
  for (const id of uniqueIds) {
    result.push(map.get(id)!);
  }

  return result;
}

async function getIds(
  db: AuthedContext["db"],
  userId: string,
  matcher: Matcher,
): Promise<BookmarkQueryReturnType[]> {
  switch (matcher.type) {
    case "tagName": {
      const comp = matcher.inverse ? notExists : exists;
      return db
        .selectDistinct({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(
              db
                .select()
                .from(tagsOnBookmarks)
                .innerJoin(
                  bookmarkTags,
                  eq(tagsOnBookmarks.tagId, bookmarkTags.id),
                )
                .where(
                  and(
                    eq(tagsOnBookmarks.bookmarkId, bookmarks.id),
                    eq(bookmarkTags.userId, userId),
                    eq(bookmarkTags.name, matcher.tagName),
                  ),
                ),
            ),
          ),
        );
    }
    case "tagged": {
      const comp = matcher.tagged ? exists : notExists;
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(
              db
                .select()
                .from(tagsOnBookmarks)
                .where(and(eq(tagsOnBookmarks.bookmarkId, bookmarks.id))),
            ),
          ),
        );
    }
    case "listName": {
      const comp = matcher.inverse ? notExists : exists;
      return db
        .selectDistinct({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(
              db
                .select()
                .from(bookmarksInLists)
                .innerJoin(
                  bookmarkLists,
                  eq(bookmarksInLists.listId, bookmarkLists.id),
                )
                .where(
                  and(
                    eq(bookmarksInLists.bookmarkId, bookmarks.id),
                    eq(bookmarkLists.userId, userId),
                    eq(bookmarkLists.name, matcher.listName),
                  ),
                ),
            ),
          ),
        );
    }
    case "inlist": {
      const comp = matcher.inList ? exists : notExists;
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(
              db
                .select()
                .from(bookmarksInLists)
                .where(and(eq(bookmarksInLists.bookmarkId, bookmarks.id))),
            ),
          ),
        );
    }
    case "rssFeedName": {
      const comp = matcher.inverse ? notExists : exists;
      return db
        .selectDistinct({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(
              db
                .select()
                .from(rssFeedImportsTable)
                .innerJoin(
                  rssFeedsTable,
                  eq(rssFeedImportsTable.rssFeedId, rssFeedsTable.id),
                )
                .where(
                  and(
                    eq(rssFeedImportsTable.bookmarkId, bookmarks.id),
                    eq(rssFeedsTable.userId, userId),
                    eq(rssFeedsTable.name, matcher.feedName),
                  ),
                ),
            ),
          ),
        );
    }
    case "archived": {
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.archived, matcher.archived),
          ),
        );
    }
    case "url": {
      const comp = matcher.inverse ? notLike : like;
      return db
        .select({ id: bookmarkLinks.id })
        .from(bookmarkLinks)
        .leftJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(bookmarkLinks.url, `%${matcher.url}%`),
          ),
        )
        .union(
          db
            .select({ id: bookmarkAssets.id })
            .from(bookmarkAssets)
            .leftJoin(bookmarks, eq(bookmarks.id, bookmarkAssets.id))
            .where(
              and(
                eq(bookmarks.userId, userId),
                // When a user is asking for a link, the inverse matcher should match only assets with URLs.
                isNotNull(bookmarkAssets.sourceUrl),
                comp(bookmarkAssets.sourceUrl, `%${matcher.url}%`),
              ),
            ),
        );
    }
    case "title": {
      const comp = matcher.inverse ? notLike : like;
      if (matcher.inverse) {
        return db
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .leftJoin(bookmarkLinks, eq(bookmarks.id, bookmarkLinks.id))
          .where(
            and(
              eq(bookmarks.userId, userId),
              or(
                isNull(bookmarks.title),
                comp(bookmarks.title, `%${matcher.title}%`),
              ),
              or(
                isNull(bookmarkLinks.title),
                comp(bookmarkLinks.title, `%${matcher.title}%`),
              ),
            ),
          );
      }

      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(bookmarks.title, `%${matcher.title}%`),
          ),
        )
        .union(
          db
            .select({ id: bookmarkLinks.id })
            .from(bookmarkLinks)
            .leftJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
            .where(
              and(
                eq(bookmarks.userId, userId),
                comp(bookmarkLinks.title, `%${matcher.title}%`),
              ),
            ),
        );
    }
    case "favourited": {
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.favourited, matcher.favourited),
          ),
        );
    }
    case "dateAfter": {
      const comp = matcher.inverse ? lt : gte;
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(bookmarks.createdAt, matcher.dateAfter),
          ),
        );
    }
    case "dateBefore": {
      const comp = matcher.inverse ? gt : lte;
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(bookmarks.createdAt, matcher.dateBefore),
          ),
        );
    }
    case "age": {
      const comp = matcher.relativeDate.direction === "newer" ? gte : lt;
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(bookmarks.createdAt, toAbsoluteDate(matcher.relativeDate)),
          ),
        );
    }
    case "type": {
      const comp = matcher.inverse ? ne : eq;
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            comp(bookmarks.type, matcher.typeName),
          ),
        );
    }
    case "and": {
      const vals = await Promise.all(
        matcher.matchers.map((m) => getIds(db, userId, m)),
      );
      return intersect(vals);
    }
    case "or": {
      const vals = await Promise.all(
        matcher.matchers.map((m) => getIds(db, userId, m)),
      );
      return union(vals);
    }
    default: {
      const _exhaustiveCheck: never = matcher;
      throw new Error("Unknown matcher type");
    }
  }
}

export async function getBookmarkIdsFromMatcher(
  ctx: AuthedContext,
  matcher: Matcher,
): Promise<string[]> {
  const results = await getIds(ctx.db, ctx.user.id, matcher);
  return results.map((r) => r.id);
}
