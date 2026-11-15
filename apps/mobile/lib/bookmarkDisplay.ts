import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

import { i18n } from "@/lib/i18n";

const MAX_DERIVED_TITLE_LENGTH = 80;

function firstLine(text: string) {
  const line =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  // Strip leading markdown markers so "# Heading" doesn't read as a raw title.
  return line.replace(/^(#{1,6}\s+|[-*+]\s+|>\s+)/, "");
}

/**
 * A note saved without a title reads better named after its first line than
 * as "Untitled".
 */
export function getBookmarkDisplayTitle(bookmark: ZBookmark): string {
  const explicit = getBookmarkTitle(bookmark)?.trim();
  if (explicit) {
    return explicit;
  }
  if (bookmark.content.type === BookmarkTypes.TEXT) {
    const line = firstLine(bookmark.content.text);
    if (line) {
      return line.length > MAX_DERIVED_TITLE_LENGTH
        ? `${line.slice(0, MAX_DERIVED_TITLE_LENGTH).trimEnd()}…`
        : line;
    }
  }
  return bookmark.content.type === BookmarkTypes.ASSET
    ? i18n.t("bookmarks.photo_title")
    : i18n.t("bookmarks.untitled");
}

/** The note text to show under the title, without repeating a derived title. */
export function getNoteBody(bookmark: ZBookmark): string {
  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    return "";
  }
  const text = bookmark.content.text.trim();
  if (getBookmarkTitle(bookmark)?.trim()) {
    return text;
  }
  const line = firstLine(text);
  return text.slice(text.indexOf(line) + line.length).trim();
}

export function getDisplayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
