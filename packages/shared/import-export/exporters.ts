import { z } from "zod";

import { BookmarkTypes, ZBookmark } from "../types/bookmarks";

export const zExportBookmarkSchema = z.object({
  createdAt: z.number(),
  title: z.string().nullable(),
  tags: z.array(z.string()),
  content: z
    .discriminatedUnion("type", [
      z.object({
        type: z.literal(BookmarkTypes.LINK),
        url: z.string(),
      }),
      z.object({
        type: z.literal(BookmarkTypes.TEXT),
        text: z.string(),
      }),
    ])
    .nullable(),
  note: z.string().nullable(),
  archived: z.boolean().optional().default(false),
});

export const zExportSchema = z.object({
  bookmarks: z.array(zExportBookmarkSchema),
});

export function toExportFormat(
  bookmark: ZBookmark,
): z.infer<typeof zExportBookmarkSchema> {
  let content = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK: {
      content = {
        type: bookmark.content.type,
        url: bookmark.content.url,
      };
      break;
    }
    case BookmarkTypes.TEXT: {
      content = {
        type: bookmark.content.type,
        text: bookmark.content.text,
      };
      break;
    }
    // Exclude asset types for now
  }
  return {
    createdAt: Math.floor(bookmark.createdAt.getTime() / 1000),
    title:
      bookmark.title ??
      (bookmark.content.type === BookmarkTypes.LINK
        ? (bookmark.content.title ?? null)
        : null),
    tags: bookmark.tags.map((t) => t.name),
    content,
    note: bookmark.note ?? null,
    archived: bookmark.archived,
  };
}

export function toNetscapeFormat(bookmarks: ZBookmark[]): string {
  const header = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;

  const footer = `</DL><p>`;

  const bookmarkEntries = bookmarks
    .map((bookmark) => {
      if (bookmark.content?.type !== BookmarkTypes.LINK) {
        return "";
      }
      const addDate = bookmark.createdAt
        ? `ADD_DATE="${Math.floor(bookmark.createdAt.getTime() / 1000)}"`
        : "";

      const tagNames = bookmark.tags.map((t) => t.name).join(",");
      const tags = tagNames.length > 0 ? `TAGS="${tagNames}"` : "";

      const encodedUrl = encodeURI(bookmark.content.url);
      const displayTitle = bookmark.title ?? bookmark.content.url;
      const encodedTitle = escapeHtml(displayTitle);

      return `    <DT><A HREF="${encodedUrl}" ${addDate} ${tags}>${encodedTitle}</A>`;
    })
    .filter(Boolean)
    .join("\n");

  return `${header}\n${bookmarkEntries}\n${footer}`;
}

function escapeHtml(input: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "'": "&#x27;",
    "`": "&#x60;",
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;",
  };

  return input.replace(/[&'`"<>]/g, (match) => escapeMap[match] || "");
}
