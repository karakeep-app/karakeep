import {
  and,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notExists,
  notInArray,
  not,
  notLike,
  or,
  SQL,
  sql,
} from "drizzle-orm";

import {
  bookmarkAssets,
  bookmarkLinks,
  bookmarkLists,
  bookmarks,
  bookmarksInLists,
  bookmarkTags,
  highlights,
  rssFeedImportsTable,
  rssFeedsTable,
  tagsOnBookmarks,
} from "@karakeep/db/schema";
import { Matcher } from "@karakeep/shared/types/search";
import { toAbsoluteDate } from "@karakeep/shared/utils/relativeDateUtils";

import { AuthedContext } from "..";

// SQLite caps expression depth at 1000 and a flat chain of N ANDs/ORs nests N
// deep, so combine conditions as a balanced tree (depth log2(N)) instead.
function combineBalanced(op: typeof and | typeof or, conditions: SQL[]): SQL {
  if (conditions.length === 0) {
    return sql`0`;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  const mid = Math.ceil(conditions.length / 2);
  return op(
    combineBalanced(op, conditions.slice(0, mid)),
    combineBalanced(op, conditions.slice(mid)),
  )!;
}

// Builds a condition on the `bookmarks` table that matches the bookmarks
// selected by `matcher`. The condition doesn't scope by user, so it must be
// applied to a query that already filters on `bookmarks.userId`.
export async function getBookmarksConditionFromMatcher(
  ctx: AuthedContext,
  matcher: Matcher,
  visitedListIds = new Set<string>(),
): Promise<SQL> {
  const { db } = ctx;
  const userId = ctx.user.id;

  switch (matcher.type) {
    case "tagName": {
      const comp = matcher.inverse ? notInArray : inArray;
      return comp(
        bookmarks.id,
        db
          .select({ id: tagsOnBookmarks.bookmarkId })
          .from(tagsOnBookmarks)
          .innerJoin(bookmarkTags, eq(tagsOnBookmarks.tagId, bookmarkTags.id))
          .where(
            and(
              eq(bookmarkTags.userId, userId),
              eq(bookmarkTags.name, matcher.tagName),
            ),
          ),
      );
    }
    case "tagged": {
      const comp = matcher.tagged ? exists : notExists;
      return comp(
        db
          .select()
          .from(tagsOnBookmarks)
          .where(eq(tagsOnBookmarks.bookmarkId, bookmarks.id)),
      );
    }
    case "listName": {
      // First, look up the list by name
      const lists = await db.query.bookmarkLists.findMany({
        where: and(
          eq(bookmarkLists.userId, userId),
          eq(bookmarkLists.name, matcher.listName),
        ),
      });

      if (lists.length === 0) {
        // No matching lists
        return sql`0`;
      }

      // Use List model to resolve list membership (manual and smart)
      // Import dynamically to avoid circular dependency
      const { List } = await import("../models/lists");
      const conditions = await Promise.all(
        lists.map(async (list) => {
          const listModel = await List.fromId(ctx, list.id);
          return await listModel.getBookmarksCondition(visitedListIds);
        }),
      );
      const inLists = combineBalanced(or, conditions);
      // Smart list conditions can evaluate to NULL (e.g. LIKE on a NULL
      // column), so coalesce before negating.
      return matcher.inverse ? sql`coalesce(${inLists}, 0) = 0` : inLists;
    }
    case "inlist": {
      const comp = matcher.inList ? exists : notExists;
      return comp(
        db
          .select()
          .from(bookmarksInLists)
          .where(eq(bookmarksInLists.bookmarkId, bookmarks.id)),
      );
    }
    case "rssFeedName": {
      const comp = matcher.inverse ? notInArray : inArray;
      return comp(
        bookmarks.id,
        db
          .select({ id: rssFeedImportsTable.bookmarkId })
          .from(rssFeedImportsTable)
          .innerJoin(
            rssFeedsTable,
            eq(rssFeedImportsTable.rssFeedId, rssFeedsTable.id),
          )
          .where(
            and(
              // NOT IN never matches if the subquery returns a NULL
              isNotNull(rssFeedImportsTable.bookmarkId),
              eq(rssFeedsTable.userId, userId),
              eq(rssFeedsTable.name, matcher.feedName),
            ),
          ),
      );
    }
    case "archived": {
      return eq(bookmarks.archived, matcher.archived);
    }
    case "url": {
      const comp = matcher.inverse ? notLike : like;
      return or(
        exists(
          db
            .select()
            .from(bookmarkLinks)
            .where(
              and(
                eq(bookmarkLinks.id, bookmarks.id),
                comp(bookmarkLinks.url, `%${matcher.url}%`),
              ),
            ),
        ),
        exists(
          db
            .select()
            .from(bookmarkAssets)
            .where(
              and(
                eq(bookmarkAssets.id, bookmarks.id),
                // When a user is asking for a link, the inverse matcher should match only assets with URLs.
                isNotNull(bookmarkAssets.sourceUrl),
                comp(bookmarkAssets.sourceUrl, `%${matcher.url}%`),
              ),
            ),
        ),
      )!;
    }
    case "title": {
      const linkTitleMatches = exists(
        db
          .select()
          .from(bookmarkLinks)
          .where(
            and(
              eq(bookmarkLinks.id, bookmarks.id),
              like(bookmarkLinks.title, `%${matcher.title}%`),
            ),
          ),
      );
      if (matcher.inverse) {
        return and(
          or(
            isNull(bookmarks.title),
            notLike(bookmarks.title, `%${matcher.title}%`),
          ),
          not(linkTitleMatches),
        )!;
      }
      return or(like(bookmarks.title, `%${matcher.title}%`), linkTitleMatches)!;
    }
    case "favourited": {
      return eq(bookmarks.favourited, matcher.favourited);
    }
    case "hasNotes": {
      return matcher.hasNotes
        ? and(isNotNull(bookmarks.note), ne(bookmarks.note, ""))!
        : or(isNull(bookmarks.note), eq(bookmarks.note, ""))!;
    }
    case "hasHighlights": {
      const comp = matcher.hasHighlights ? inArray : notInArray;
      return comp(
        bookmarks.id,
        db
          .select({ id: highlights.bookmarkId })
          .from(highlights)
          .where(eq(highlights.userId, userId)),
      );
    }
    case "dateAfter": {
      const comp = matcher.inverse ? lt : gte;
      return comp(bookmarks.createdAt, matcher.dateAfter);
    }
    case "dateBefore": {
      const comp = matcher.inverse ? gt : lte;
      return comp(bookmarks.createdAt, matcher.dateBefore);
    }
    case "age": {
      const comp = matcher.relativeDate.direction === "newer" ? gte : lt;
      return comp(bookmarks.createdAt, toAbsoluteDate(matcher.relativeDate));
    }
    case "type": {
      const comp = matcher.inverse ? ne : eq;
      return comp(bookmarks.type, matcher.typeName);
    }
    case "brokenLinks": {
      // Only applies to bookmarks of type LINK
      return exists(
        db
          .select()
          .from(bookmarkLinks)
          .where(
            and(
              eq(bookmarkLinks.id, bookmarks.id),
              matcher.brokenLinks
                ? or(
                    eq(bookmarkLinks.crawlStatus, "failure"),
                    lt(bookmarkLinks.crawlStatusCode, 200),
                    gt(bookmarkLinks.crawlStatusCode, 299),
                  )
                : and(
                    eq(bookmarkLinks.crawlStatus, "success"),
                    gte(bookmarkLinks.crawlStatusCode, 200),
                    lte(bookmarkLinks.crawlStatusCode, 299),
                  ),
            ),
          ),
      );
    }
    case "source": {
      return matcher.inverse
        ? or(ne(bookmarks.source, matcher.source), isNull(bookmarks.source))!
        : eq(bookmarks.source, matcher.source);
    }
    case "and": {
      const conditions = await Promise.all(
        matcher.matchers.map((m) =>
          getBookmarksConditionFromMatcher(ctx, m, visitedListIds),
        ),
      );
      return combineBalanced(and, conditions);
    }
    case "or": {
      const conditions = await Promise.all(
        matcher.matchers.map((m) =>
          getBookmarksConditionFromMatcher(ctx, m, visitedListIds),
        ),
      );
      return combineBalanced(or, conditions);
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
  const condition = await getBookmarksConditionFromMatcher(ctx, matcher);
  const results = await ctx.db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, ctx.user.id), condition));
  return results.map((r) => r.id);
}
