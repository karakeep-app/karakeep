import { asc, eq } from "drizzle-orm";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import type { ZCursor } from "@karakeep/shared/types/pagination";
import type { AuthedContext } from "@karakeep/trpc";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

/**
 * Fetches all bookmarks for a user with all necessary relations for export
 * @deprecated Use fetchBookmarksInBatches for memory-efficient iteration
 */
export async function fetchAllBookmarksForUser(
  dbInstance: typeof db,
  userId: string,
): Promise<ZBookmark[]> {
  const allBookmarks = await dbInstance.query.bookmarks.findMany({
    where: eq(bookmarks.userId, userId),
    with: {
      tagsOnBookmarks: {
        with: {
          tag: true,
        },
      },
      link: true,
      text: true,
      asset: true,
      assets: true,
    },
    orderBy: [asc(bookmarks.createdAt)],
  });

  // Transform to ZBookmark format
  return allBookmarks.map((bookmark) => {
    let content: ZBookmark["content"] | null = null;

    switch (bookmark.type) {
      case BookmarkTypes.LINK:
        if (bookmark.link) {
          content = {
            type: BookmarkTypes.LINK,
            url: bookmark.link.url,
            title: bookmark.link.title || undefined,
            description: bookmark.link.description || undefined,
            imageUrl: bookmark.link.imageUrl || undefined,
            favicon: bookmark.link.favicon || undefined,
          };
        }
        break;
      case BookmarkTypes.TEXT:
        if (bookmark.text) {
          content = {
            type: BookmarkTypes.TEXT,
            text: bookmark.text.text || "",
          };
        }
        break;
      case BookmarkTypes.ASSET:
        if (bookmark.asset) {
          content = {
            type: BookmarkTypes.ASSET,
            assetType: bookmark.asset.assetType,
            assetId: bookmark.asset.assetId,
          };
        }
        break;
    }

    return {
      id: bookmark.id,
      title: bookmark.title || null,
      createdAt: bookmark.createdAt,
      archived: bookmark.archived,
      favourited: bookmark.favourited,
      taggingStatus: bookmark.taggingStatus || "pending",
      note: bookmark.note || null,
      summary: bookmark.summary || null,
      content,
      tags: bookmark.tagsOnBookmarks.map((t) => ({
        id: t.tag.id,
        name: t.tag.name,
        attachedBy: t.attachedBy,
      })),
      assets: bookmark.assets.map((a) => ({
        id: a.id,
        assetType: a.assetType,
      })),
    } as ZBookmark;
  });
}

/**
 * Fetches bookmarks in batches using cursor-based pagination from the Bookmark model
 * This is memory-efficient for large datasets as it only loads one batch at a time
 */
export async function* fetchBookmarksInBatches(
  ctx: AuthedContext,
  batchSize = 1000,
): AsyncGenerator<ZBookmark[], number, undefined> {
  let cursor: ZCursor | null = null;
  let totalFetched = 0;

  while (true) {
    const result = await Bookmark.loadMulti(ctx, {
      limit: batchSize,
      cursor: cursor,
      sortOrder: "asc",
      includeContent: false, // We don't need full content for export
    });

    if (result.bookmarks.length === 0) {
      break;
    }

    // Convert Bookmark instances to ZBookmark
    const batch = result.bookmarks.map((b) => b.asZBookmark());
    yield batch;

    totalFetched += batch.length;
    cursor = result.nextCursor;

    // If there's no next cursor, we've reached the end
    if (!cursor) {
      break;
    }
  }

  return totalFetched;
}
