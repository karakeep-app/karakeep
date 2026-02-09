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
  not,
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
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
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
  visitedListNames = new Set<string>(),
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
      // Support both manual and smart lists when filtering by list name
      // 1) Load all lists with this name for the user
      // Detect and prevent cycles: if we're already evaluating this list name, bail out
      if (visitedListNames.has(matcher.listName)) {
        return [];
      }

      // Clone the visitedListNames set to avoid mutation issues across branches
      const newVisitedListNames = new Set(visitedListNames);
      newVisitedListNames.add(matcher.listName);
      // Hard cap to avoid runaway recursion from adversarial list references
      if (newVisitedListNames.size > 32) {
        return [];
      }

      const lists = await db
        .select({
          id: bookmarkLists.id,
          type: bookmarkLists.type,
          query: bookmarkLists.query,
        })
        .from(bookmarkLists)
        .where(
          and(
            eq(bookmarkLists.userId, userId),
            eq(bookmarkLists.name, matcher.listName),
          ),
        );

      // If no such list exists, either empty (non-inverse) or all user's bookmarks (inverse)
      if (!lists || lists.length === 0) {
        if (matcher.inverse) {
          return db
            .select({ id: bookmarks.id })
            .from(bookmarks)
            .where(eq(bookmarks.userId, userId));
        }
        return [];
      }

      // 2) Collect IDs from manual lists via membership table
      const manualListIds = lists
        .filter((l) => l.type === "manual")
        .map((l) => l.id);
      const manualIdsPromise = manualListIds.length
        ? db
            .selectDistinct({ id: bookmarksInLists.bookmarkId })
            .from(bookmarksInLists)
            .innerJoin(bookmarks, eq(bookmarksInLists.bookmarkId, bookmarks.id))
            .where(
              and(
                eq(bookmarks.userId, userId),
                // user scoping ensured by lists query; membership rows imply same user via listId
                // Fetch all bookmarks that are in any of the manual lists with this name
                inArray(bookmarksInLists.listId, manualListIds),
              ),
            )
        : Promise.resolve([] as { id: string }[]);

      // 3) Collect IDs from smart lists by evaluating their queries recursively
      const smartLists = lists.filter((l) => l.type === "smart");
      const smartIdsPromise = (async () => {
        if (smartLists.length === 0) return [] as BookmarkQueryReturnType[];
        const results: BookmarkQueryReturnType[][] = [];
        for (const sl of smartLists) {
          if (!sl.query) continue;
          const parsed = parseSearchQuery(sl.query);
          if (!parsed.matcher) continue;
          const ids = await getIds(
            db,
            userId,
            parsed.matcher,
            new Set(newVisitedListNames),
          );
          results.push(ids);
        }
        return union(results);
      })();

      const [manualIds, smartIds] = await Promise.all([
        manualIdsPromise,
        smartIdsPromise,
      ]);

      const includedSet = new Set<string>([
        ...manualIds.map((r) => r.id),
        ...smartIds.map((r) => r.id),
      ]);

      if (!matcher.inverse) {
        return Array.from(includedSet).map((id) => ({ id }));
      }

      // 4) Inverse: return all user's bookmarks excluding includedSet
      if (includedSet.size === 0) {
        return db
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(eq(bookmarks.userId, userId));
      }
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            not(inArray(bookmarks.id, Array.from(includedSet))),
          ),
        );
    }
    case "inlist": {
      // Support checking if a bookmark is in any list (manual or smart)
      // 1) Check if we're in a recursion cycle for is:inlist
      const INLIST_RECURSION_MARKER = "___INTERNAL_IN_LIST_RECURSION_MARKER___";
      if (visitedListNames.has(INLIST_RECURSION_MARKER)) {
        // Fallback to manual lists only to break cycle
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

      const newVisitedListNames = new Set(visitedListNames);
      newVisitedListNames.add(INLIST_RECURSION_MARKER);

      // 2) Get IDs from manual lists
      const manualIdsPromise = db
        .selectDistinct({ id: bookmarksInLists.bookmarkId })
        .from(bookmarksInLists)
        .innerJoin(bookmarkLists, eq(bookmarksInLists.listId, bookmarkLists.id))
        .where(
          and(
            eq(bookmarkLists.userId, userId),
            eq(bookmarkLists.type, "manual"),
          ),
        )
        .then((rows) => rows.map((r) => ({ id: r.id })));

      // 3) Get IDs from smart lists
      const smartLists = await db
        .select({
          id: bookmarkLists.id,
          query: bookmarkLists.query,
        })
        .from(bookmarkLists)
        .where(
          and(
            eq(bookmarkLists.userId, userId),
            eq(bookmarkLists.type, "smart"),
          ),
        );

      const smartIdsPromise = (async () => {
        if (smartLists.length === 0) return [] as BookmarkQueryReturnType[];
        const results: BookmarkQueryReturnType[][] = [];
        for (const sl of smartLists) {
          if (!sl.query) continue;
          const parsed = parseSearchQuery(sl.query);
          if (!parsed.matcher) continue;
          const ids = await getIds(
            db,
            userId,
            parsed.matcher,
            new Set(newVisitedListNames),
          );
          results.push(ids);
        }
        return union(results);
      })();

      const [manualIds, smartIds] = await Promise.all([
        manualIdsPromise,
        smartIdsPromise,
      ]);

      const includedSet = new Set<string>([
        ...manualIds.map((r) => r.id),
        ...smartIds.map((r) => r.id),
      ]);

      if (matcher.inList) {
        return Array.from(includedSet).map((id) => ({ id }));
      }

      // Inverse: return all user's bookmarks excluding includedSet
      if (includedSet.size === 0) {
        return db
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(eq(bookmarks.userId, userId));
      }
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            not(inArray(bookmarks.id, Array.from(includedSet))),
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
    case "brokenLinks": {
      // Only applies to bookmarks of type LINK
      return db
        .select({ id: bookmarkLinks.id })
        .from(bookmarkLinks)
        .leftJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
        .where(
          and(
            eq(bookmarks.userId, userId),
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
        );
    }
    case "source": {
      return db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            matcher.inverse
              ? or(
                  ne(bookmarks.source, matcher.source),
                  isNull(bookmarks.source),
                )
              : eq(bookmarks.source, matcher.source),
          ),
        );
    }
    case "and": {
      const vals = await Promise.all(
        matcher.matchers.map((m) =>
          getIds(db, userId, m, new Set(visitedListNames)),
        ),
      );
      return intersect(vals);
    }
    case "or": {
      const vals = await Promise.all(
        matcher.matchers.map((m) =>
          getIds(db, userId, m, new Set(visitedListNames)),
        ),
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
  const results = await getIds(ctx.db, ctx.user.id, matcher, new Set<string>());
  return results.map((r) => r.id);
}
