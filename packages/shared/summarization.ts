import { BookmarkTypes } from "./types/bookmarks";

/**
 * The bookmark fields summarization needs. Declared explicitly rather than
 * derived from a drizzle query: drizzle types the `link`/`text`/`asset`
 * relations as non-nullable, but only the relation matching the bookmark's
 * `type` is actually present at runtime.
 */
export interface SummarizableBookmark {
  type: string;
  link?: {
    title: string | null;
    description: string | null;
    publisher: string | null;
    author: string | null;
    url: string | null;
  } | null;
  text?: {
    text: string | null;
  } | null;
  asset?: {
    content: string | null;
    fileName: string | null;
  } | null;
}

/**
 * Builds the text handed to the inference client for a given bookmark.
 *
 * Returns `null` when the bookmark carries nothing worth summarizing, so the
 * caller can skip the inference call instead of sending an empty prompt.
 *
 * `linkPlainTextContent` is resolved by the caller because extracting it hits
 * the asset store, which keeps this function pure and unit testable.
 */
export function buildSummarizationInput(
  bookmark: SummarizableBookmark,
  linkPlainTextContent: string,
): string | null {
  switch (bookmark.type) {
    case BookmarkTypes.LINK: {
      const link = bookmark.link;
      if (!link) {
        return null;
      }
      if (!link.description?.trim() && !linkPlainTextContent.trim()) {
        return null;
      }
      return `
Title: ${link.title ?? ""}
Description: ${link.description ?? ""}
Content: ${linkPlainTextContent}
Publisher: ${link.publisher ?? ""}
Author: ${link.author ?? ""}
URL: ${link.url ?? ""}
`;
    }
    case BookmarkTypes.TEXT: {
      const content = bookmark.text?.text;
      if (!content?.trim()) {
        return null;
      }
      return `
Content: ${content}
`;
    }
    case BookmarkTypes.ASSET: {
      // Populated by the asset preprocessing worker: extracted PDF text, or
      // text recovered from an image.
      const content = bookmark.asset?.content;
      if (!content?.trim()) {
        return null;
      }
      return `
Title: ${bookmark.asset?.fileName ?? ""}
Content: ${content}
`;
    }
    default:
      return null;
  }
}
