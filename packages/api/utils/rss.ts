import RSS from "rss";

import serverConfig from "@karakeep/shared/config";
import {
  BookmarkTypes,
  ZPublicBookmark,
} from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { isAllowedBookmarkUrl } from "@karakeep/shared/utils/url";

const MAX_TEXT_TITLE_LENGTH = 80;

function textTitle(text: string) {
  const firstLine = text.trim().split("\n")[0].trim();
  return firstLine.length > MAX_TEXT_TITLE_LENGTH
    ? `${firstLine.slice(0, MAX_TEXT_TITLE_LENGTH - 1)}…`
    : firstLine;
}

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
        b.content.type === BookmarkTypes.ASSET ||
        b.content.type === BookmarkTypes.TEXT,
    )
    .forEach((bookmark) => {
      feed.item({
        date: bookmark.createdAt,
        title:
          bookmark.title ||
          (bookmark.content.type === BookmarkTypes.TEXT
            ? textTitle(bookmark.content.text)
            : ""),
        url:
          bookmark.content.type === BookmarkTypes.LINK
            ? bookmark.content.url
            : bookmark.content.type === BookmarkTypes.ASSET
              ? `${serverConfig.publicUrl}${getAssetUrl(bookmark.content.assetId)}`
              : params.siteUrl,
        guid: bookmark.id,
        author:
          bookmark.content.type === BookmarkTypes.LINK
            ? (bookmark.content.author ?? undefined)
            : undefined,
        categories: bookmark.tags,
        description:
          bookmark.description ||
          (bookmark.content.type === BookmarkTypes.TEXT
            ? bookmark.content.text
            : ""),
      });
    });

  return feed.xml({ indent: true });
}
