import { CallToolResult } from "@modelcontextprotocol/sdk/types";

import { KarakeepAPISchemas } from "@karakeep/sdk";

import { turndownService } from "./shared";

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

export function pickDefined<T extends object>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(input) as (keyof T)[]) {
    if (input[key] !== undefined) {
      out[key] = input[key];
    }
  }
  return out;
}

export function compactTag(tag: KarakeepAPISchemas["Tag"]): string {
  const aiCount = tag.numBookmarksByAttachedType.ai ?? 0;
  const humanCount = tag.numBookmarksByAttachedType.human ?? 0;
  return `Tag ID: ${tag.id}
Name: ${tag.name}
Bookmarks: ${tag.numBookmarks} (human: ${humanCount}, ai: ${aiCount})`;
}

export function compactBookmark(
  bookmark: KarakeepAPISchemas["Bookmark"],
  options: { includeContent?: boolean } = {},
): string {
  const includeContent = options.includeContent ?? false;
  let content: string;
  if (bookmark.content.type === "link") {
    content = `Bookmark type: link
Bookmarked URL: ${bookmark.content.url}
description: ${bookmark.content.description ?? ""}
author: ${bookmark.content.author ?? ""}
publisher: ${bookmark.content.publisher ?? ""}`;
    if (includeContent && bookmark.content.htmlContent) {
      content += `\n  Content: ${turndownService.turndown(bookmark.content.htmlContent)}`;
    }
  } else if (bookmark.content.type === "text") {
    content = `Bookmark type: text
  Source URL: ${bookmark.content.sourceUrl ?? ""}
  Text: ${bookmark.content.text}`;
  } else if (bookmark.content.type === "asset") {
    content = `Bookmark type: media
Asset ID: ${bookmark.content.assetId}
Asset type: ${bookmark.content.assetType}
Source URL: ${bookmark.content.sourceUrl ?? ""}`;
    if (includeContent && bookmark.content.content) {
      content += `\n  Content: ${bookmark.content.content}`;
    }
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
