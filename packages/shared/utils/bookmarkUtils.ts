import { BookmarkTypes, ZBookmark, ZBookmarkedLink } from "../types/bookmarks";
import { getAssetUrl } from "./assetUtils";

export function getBookmarkLinkAssetIdOrUrl(bookmark: ZBookmarkedLink) {
  if (bookmark.imageAssetId) {
    return { assetId: bookmark.imageAssetId, localAsset: true as const };
  }
  if (bookmark.screenshotAssetId) {
    return { assetId: bookmark.screenshotAssetId, localAsset: true as const };
  }
  return bookmark.imageUrl
    ? { url: bookmark.imageUrl, localAsset: false as const }
    : null;
}

export function getBookmarkLinkImageUrl(bookmark: ZBookmarkedLink) {
  const assetOrUrl = getBookmarkLinkAssetIdOrUrl(bookmark);
  if (!assetOrUrl) {
    return null;
  }
  if (!assetOrUrl.localAsset) {
    return assetOrUrl;
  }
  return {
    url: getAssetUrl(assetOrUrl.assetId),
    localAsset: true,
  };
}

export function isBookmarkStillCrawling(bookmark: ZBookmark) {
  if (bookmark.content.type != BookmarkTypes.LINK) {
    return false;
  }
  if (bookmark.content.crawlStatus) {
    return bookmark.content.crawlStatus === "pending";
  }
  return !bookmark.content.crawledAt;
}

export function isBookmarkStillTagging(bookmark: ZBookmark) {
  return bookmark.taggingStatus == "pending";
}

export function isBookmarkStillSummarizing(bookmark: ZBookmark) {
  return bookmark.summarizationStatus == "pending";
}

export function isBookmarkStillLoading(bookmark: ZBookmark) {
  return (
    isBookmarkStillTagging(bookmark) ||
    isBookmarkStillCrawling(bookmark) ||
    isBookmarkStillSummarizing(bookmark)
  );
}

export function getBookmarkRefreshInterval(
  bookmark: ZBookmark,
): number | false {
  if (!isBookmarkStillLoading(bookmark)) {
    return false;
  }

  // For the first 30 seconds, we'll refresh the bookmark every second
  if (Date.now().valueOf() - bookmark.createdAt.valueOf() < 30 * 1000) {
    return 1000;
  }

  // Then, we'll refresh it every 10 seconds after than for 10mins
  if (Date.now().valueOf() - bookmark.createdAt.valueOf() < 10 * 60 * 1000) {
    return 10_000;
  }

  // Then, we'll refresh it every minute after than for 6hrs
  if (
    Date.now().valueOf() - bookmark.createdAt.valueOf() <
    6 * 60 * 60 * 1000
  ) {
    return 60_000;
  }

  // Then we'll stop refreshing it
  return false;
}

export function getSourceUrl(bookmark: ZBookmark) {
  if (bookmark.content.type === BookmarkTypes.LINK) {
    return bookmark.content.url;
  }
  if (bookmark.content.type === BookmarkTypes.ASSET) {
    return bookmark.content.sourceUrl ?? null;
  }
  if (bookmark.content.type === BookmarkTypes.TEXT) {
    return bookmark.content.sourceUrl ?? null;
  }
  return null;
}

export function getBookmarkTitle(bookmark: ZBookmark) {
  let title: string | null = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      title = bookmark.content.title ?? bookmark.content.url;
      break;
    case BookmarkTypes.TEXT:
      title = null;
      break;
    case BookmarkTypes.ASSET:
      title = bookmark.content.fileName ?? null;
      break;
  }

  return bookmark.title ? bookmark.title : title;
}

const DISPLAY_TITLE_MAX_LENGTH = 80;

function stripMarkdownMarkers(line: string) {
  return (
    line
      // Block markers: headings, quotes, list items and task checkboxes
      .replace(/^\s*(?:#{1,6}\s+|(?:>\s*)+)/, "")
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
      .replace(/^\s*\[[ xX]\]\s+/, "")
      // Images and links keep their text
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Paired emphasis and inline code, leaving snake_case and 2*3 alone
      .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
      .replace(/(^|[^\w*])\*(?=\S)([^*]+?)(?<=\S)\*(?![\w*])/g, "$1$2")
      .replace(/(^|[^\w_])_(?=\S)([^_]+?)(?<=\S)_(?![\w_])/g, "$1$2")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .trim()
  );
}

/**
 * The first line of a note with text in it, as plain text. Fences and
 * horizontal rules aren't text, so they're skipped.
 */
export function getTextDisplayTitle(
  text: string,
  maxLength = DISPLAY_TITLE_MAX_LENGTH,
) {
  for (const line of text.split("\n")) {
    if (/^\s*(?:```|~~~|(?:[-*_]\s*){3,}$)/.test(line)) {
      continue;
    }
    const title = stripMarkdownMarkers(line);
    if (title) {
      return title.length > maxLength
        ? `${title.slice(0, maxLength).trimEnd()}\u2026`
        : title;
    }
  }
  return null;
}

/**
 * What to call a bookmark in the UI, so that every surface agrees: its title, or
 * for a note without one, its first line. For display only: use getBookmarkTitle
 * for anything that's saved or edited.
 */
export function getBookmarkDisplayTitle(bookmark: ZBookmark) {
  // A blank title counts as none, so the link title, URL or file name is used.
  const title = getBookmarkTitle({
    ...bookmark,
    title: bookmark.title?.trim() || null,
  })?.trim();
  if (title) {
    return title;
  }
  return bookmark.content.type === BookmarkTypes.TEXT
    ? getTextDisplayTitle(bookmark.content.text)
    : null;
}
