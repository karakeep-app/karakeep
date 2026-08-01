import RSS from "rss";

import serverConfig from "@karakeep/shared/config";
import {
  BookmarkTypes,
  ZPublicBookmark,
} from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { isAllowedBookmarkUrl } from "@karakeep/shared/utils/url";

export function toRSS(
  params: {
    title: string;
    description?: string;
    feedUrl: string;
    siteUrl: string;
  },
  bookmarks: ZPublicBookmark[],
) {
  const feed = new RSS({
    title: params.title,
    feed_url: params.feedUrl,
    site_url: params.siteUrl,
    description: params.description,
    generator: "Karakeep",
  });

  bookmarks
    .filter(
      (b) =>
        // Drop links with unsafe schemes (javascript:, data:, ...) that may
        // predate URL validation, so feed readers can't follow them.
        (b.content.type === BookmarkTypes.LINK &&
          isAllowedBookmarkUrl(b.content.url)) ||
        b.content.type === BookmarkTypes.ASSET,
    )
    .forEach((bookmark) => {
      feed.item({
        date: bookmark.createdAt,
        title: bookmark.title ?? "",
        url:
          bookmark.content.type === BookmarkTypes.LINK
            ? bookmark.content.url
            : bookmark.content.type === BookmarkTypes.ASSET
              ? `${serverConfig.publicUrl}${getAssetUrl(bookmark.content.assetId)}`
              : "",
        guid: bookmark.id,
        author:
          bookmark.content.type === BookmarkTypes.LINK
            ? (bookmark.content.author ?? undefined)
            : undefined,
        categories: bookmark.tags,
        description: bookmark.description ?? "",
      });
    });

  return feed.xml({ indent: true });
}
