import { eq } from "drizzle-orm";

import { bookmarks } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  chunkTextForTts,
  htmlToNarrationText,
  stripUrlsForNarration,
} from "@karakeep/shared/utils/ttsUtils";

import type { Context } from "../index";
import { Bookmark } from "../models/bookmarks";

export const MAX_TTS_CHUNKS = 300;

export async function getNarrationText(
  db: Context["db"],
  bookmarkId: string,
  userId: string,
): Promise<string | null> {
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: { link: true, text: true },
  });
  if (!bookmark) {
    return null;
  }
  if (bookmark.type === BookmarkTypes.LINK && bookmark.link) {
    const html = await Bookmark.getBookmarkHtmlContent(bookmark.link, userId);
    return html ? htmlToNarrationText(html) : null;
  }
  if (bookmark.type === BookmarkTypes.TEXT && bookmark.text) {
    return bookmark.text.text
      ? stripUrlsForNarration(bookmark.text.text)
      : null;
  }
  return null;
}

/**
 * The exact chunks the worker synthesizes, so the client can map audio to
 * text. Narration is capped at MAX_TTS_CHUNKS; `truncated` tells the client
 * the audio stops before the end of the article.
 */
export function narrationChunks(text: string): {
  chunks: string[];
  truncated: boolean;
} {
  const all = chunkTextForTts(text);
  return {
    chunks: all.slice(0, MAX_TTS_CHUNKS),
    truncated: all.length > MAX_TTS_CHUNKS,
  };
}
