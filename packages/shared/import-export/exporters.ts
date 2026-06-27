import { z } from "zod";

import { BookmarkTypes, ZBookmark } from "../types/bookmarks";
import { ZBookmarkList } from "../types/lists";

export const zExportListSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string(),
  type: z.enum(["manual", "smart"]),
  query: z.string().nullable(),
  parentId: z.string().nullable(),
});

export const zExportBookmarkSchema = z.object({
  createdAt: z.number(),
  title: z.string().nullable(),
  tags: z.array(z.string()),
  lists: z.array(z.string()).optional().default([]),
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
  lists: z.array(zExportListSchema).optional().default([]),
});

export function toExportFormat(
  bookmark: ZBookmark,
  listIds?: string[],
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
    lists: listIds ?? [],
    content,
    note: bookmark.note ?? null,
    archived: bookmark.archived,
  };
}

export function toExportListFormat(
  list: ZBookmarkList,
): z.infer<typeof zExportListSchema> {
  return {
    id: list.id,
    name: list.name,
    description: list.description ?? null,
    icon: list.icon,
    type: list.type,
    query: list.query ?? null,
    parentId: list.parentId,
  };
}

export function toNetscapeFormat(
  bookmarks: ZBookmark[],
  lists: z.infer<typeof zExportListSchema>[] = [],
  bookmarkListMap = new Map<string, string[]>(),
): string {
  const header = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>`;

  // Group lists by parentId for tree traversal
  const listChildren = new Map<
    string | null,
    z.infer<typeof zExportListSchema>[]
  >();
  for (const list of lists) {
    const parent = list.parentId;
    if (!listChildren.has(parent)) listChildren.set(parent, []);
    listChildren.get(parent)!.push(list);
  }

  // Build reverse map: listId -> bookmarks in that list
  const bookmarkById = new Map(bookmarks.map((b) => [b.id, b]));
  const listBookmarks = new Map<string, ZBookmark[]>();
  for (const [bookmarkId, listIds] of bookmarkListMap) {
    const bookmark = bookmarkById.get(bookmarkId);
    if (!bookmark) continue;
    for (const listId of listIds) {
      if (!listBookmarks.has(listId)) listBookmarks.set(listId, []);
      listBookmarks.get(listId)!.push(bookmark);
    }
  }

  // Bookmarks not in any list appear at the root level
  const bookmarksInAnyList = new Set(
    [...bookmarkListMap.entries()]
      .filter(([, ids]) => ids.length > 0)
      .map(([id]) => id),
  );
  const rootBookmarks = bookmarks.filter((b) => !bookmarksInAnyList.has(b.id));

  function renderBookmark(bookmark: ZBookmark, indent: string): string {
    if (bookmark.content?.type !== BookmarkTypes.LINK) return "";
    const addDate = bookmark.createdAt
      ? `ADD_DATE="${Math.floor(bookmark.createdAt.getTime() / 1000)}"`
      : "";
    const tagNames = bookmark.tags.map((t) => t.name).join(",");
    const tags = tagNames.length > 0 ? `TAGS="${tagNames}"` : "";
    const encodedUrl = encodeURI(bookmark.content.url);
    const encodedTitle = escapeHtml(bookmark.title ?? bookmark.content.url);
    return `${indent}<DT><A HREF="${encodedUrl}" ${addDate} ${tags}>${encodedTitle}</A>\n`;
  }

  // Render the folders using recursion
  function renderFolder(listId: string | null, depth: number): string {
    const indent = "    ".repeat(depth);
    let output = "";

    const booksHere =
      listId === null ? rootBookmarks : (listBookmarks.get(listId) ?? []);
    for (const bookmark of booksHere) {
      output += renderBookmark(bookmark, indent);
    }

    for (const child of listChildren.get(listId) ?? []) {
      output += `${indent}<DT><H3>${escapeHtml(child.name)}</H3>\n`;
      output += `${indent}<DL><p>\n`;
      output += renderFolder(child.id, depth + 1);
      output += `${indent}</DL><p>\n`;
    }

    return output;
  }

  return `${header}\n<DL><p>\n${renderFolder(null, 1)}</DL><p>`;
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
