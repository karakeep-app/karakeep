import { asc, eq } from "drizzle-orm";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { db } from "@karakeep/db";
import { bookmarks } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

/**
 * Fetches all bookmarks for a user with all necessary relations for export
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
