import { getDomainFromUrl } from "@/lib/dense/format";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

export function getDenseRowTitle(bookmark: ZBookmark) {
  if (bookmark.title) return bookmark.title;
  if (bookmark.content.type === BookmarkTypes.LINK) {
    return bookmark.content.title ?? bookmark.content.url;
  }
  if (bookmark.content.type === BookmarkTypes.ASSET) {
    return bookmark.content.fileName ?? "Untitled asset";
  }
  return "Untitled note";
}

export function getDenseRowSource(bookmark: ZBookmark) {
  if (bookmark.content.type === BookmarkTypes.LINK) {
    return getDomainFromUrl(bookmark.content.url);
  }
  if (bookmark.content.type === BookmarkTypes.ASSET) {
    return bookmark.content.assetType;
  }
  return null;
}
