import { CallToolResult } from "@modelcontextprotocol/sdk/types";

import { KarakeepAPISchemas } from "@karakeep/sdk";

export function toMcpToolError(
  error: KarakeepAPISchemas["Error"] | string | undefined,
): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          typeof error === "string"
            ? error
            : error
              ? JSON.stringify(error)
              : `Something went wrong`,
      },
    ],
  };
}

export function compactBookmark(
  bookmark: KarakeepAPISchemas["Bookmark"],
): string {
  let content: string;
  if (bookmark.content.type === "link") {
    content = `Bookmark type: link
Bookmarked URL: ${bookmark.content.url}
description: ${bookmark.content.description ?? ""}
author: ${bookmark.content.author ?? ""}
publisher: ${bookmark.content.publisher ?? ""}`;
  } else if (bookmark.content.type === "text") {
    content = `Bookmark type: text
  Source URL: ${bookmark.content.sourceUrl ?? ""}`;
  } else if (bookmark.content.type === "asset") {
    content = `Bookmark type: media
Asset ID: ${bookmark.content.assetId}
Asset type: ${bookmark.content.assetType}
Source URL: ${bookmark.content.sourceUrl ?? ""}`;
  } else {
    content = `Bookmark type: unknown`;
  }

  return `Bookmark ID: ${bookmark.id}
  Created at: ${bookmark.createdAt}
  Title: ${
    bookmark.title
      ? bookmark.title
      : ((bookmark.content.type === "link" ? bookmark.content.title : "") ?? "")
  }
  Summary: ${bookmark.summary ?? ""}
  Note: ${bookmark.note ?? ""}
  ${content}
  Tags: ${bookmark.tags.map((t) => t.name).join(", ")}`;
}

export function compactSearchBookmark(
  bookmark: KarakeepAPISchemas["SearchBookmark"],
): string {
  const base = compactBookmark(bookmark);
  if (!bookmark.matchedContent) {
    return base;
  }

  return `${base}
  Matched content offsets: ${bookmark.matchedContent.startOffset}-${bookmark.matchedContent.endOffset}
  Match offsets: ${bookmark.matchedContent.matchStartOffset}-${bookmark.matchedContent.matchEndOffset}
  Matched content: ${bookmark.matchedContent.text}`;
}

export function compactBookmarkContentSlice(
  content: KarakeepAPISchemas["BookmarkContentSlice"],
): string {
  return `Offsets: ${content.startOffset}-${content.endOffset} / ${content.totalLength}
Has more before: ${content.hasMoreBefore ? "yes" : "no"}
Has more after: ${content.hasMoreAfter ? "yes" : "no"}

${content.text}`;
}
