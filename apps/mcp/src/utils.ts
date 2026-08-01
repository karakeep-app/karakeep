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

export function compactList(list: KarakeepAPISchemas["List"]): string {
  return `List ID: ${list.id}
Name: ${list.name}
Icon: ${list.icon}
Type: ${list.type}
Description: ${list.description ?? ""}
Parent ID: ${list.parentId ?? ""}
Query: ${list.query ?? ""}
Public: ${list.public}
Has collaborators: ${list.hasCollaborators}
User role: ${list.userRole}`;
}

export function compactHighlight(
  highlight: KarakeepAPISchemas["Highlight"],
): string {
  return `Highlight ID: ${highlight.id}
Bookmark ID: ${highlight.bookmarkId}
Created at: ${highlight.createdAt}
Range: ${highlight.startOffset}-${highlight.endOffset}
Color: ${highlight.color}
Text: ${highlight.text ?? ""}
Note: ${highlight.note ?? ""}`;
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

  const assets =
    bookmark.assets.length > 0
      ? bookmark.assets
          .map(
            (asset) =>
              `${asset.id} (${asset.assetType}${asset.fileName ? `, ${asset.fileName}` : ""})`,
          )
          .join(", ")
      : "none";

  return `Bookmark ID: ${bookmark.id}
  Created at: ${bookmark.createdAt}
  Modified at: ${bookmark.modifiedAt ?? ""}
  Title: ${
    bookmark.title
      ? bookmark.title
      : ((bookmark.content.type === "link" ? bookmark.content.title : "") ?? "")
  }
  Archived: ${bookmark.archived}
  Favourited: ${bookmark.favourited}
  Source: ${bookmark.source ?? ""}
  Tagging status: ${bookmark.taggingStatus ?? ""}
  Summarization status: ${bookmark.summarizationStatus ?? ""}
  Embedding status: ${bookmark.embeddingStatus ?? ""}
  Summary: ${bookmark.summary ?? ""}
  Note: ${bookmark.note ?? ""}
  ${content}
  Tags: ${bookmark.tags.map((t) => t.name).join(", ")}
  Assets: ${assets}`;
}
