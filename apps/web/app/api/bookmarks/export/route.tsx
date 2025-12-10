import { NextRequest } from "next/server";
import { api, createContextFromRequest } from "@/server/api/client";
import { z } from "zod";

import {
  toExportFormat,
  toListExportFormat,
  toNetscapeFormat,
  zExportSchema,
} from "@karakeep/shared/import-export";
import { MAX_NUM_BOOKMARKS_PER_PAGE } from "@karakeep/shared/types/bookmarks";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const ctx = await createContextFromRequest(request);
  if (!ctx.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "json";

  const req = {
    limit: MAX_NUM_BOOKMARKS_PER_PAGE,
    useCursorV2: true,
    includeContent: true,
  };

  let resp = await api.bookmarks.getBookmarks(req);
  let bookmarks = resp.bookmarks;

  while (resp.nextCursor) {
    resp = await api.bookmarks.getBookmarks({
      ...req,
      cursor: resp.nextCursor,
    });
    bookmarks = [...bookmarks, ...resp.bookmarks];
  }

  if (format === "json") {
    // Fetch all lists for the user
    const listsResponse = await api.lists.list();
    const lists = Array.isArray(listsResponse)
      ? listsResponse
      : listsResponse.lists;

    // Build a map from bookmark ID to list IDs by querying each list
    const bookmarkListMap = new Map<string, string[]>();
    for (const list of lists) {
      try {
        // Get all bookmarks in this list
        const listBookmarks = await api.bookmarks.getBookmarks({
          listId: list.id,
          limit: 1000, // Use a large limit to get all bookmarks
          includeContent: false, // We don't need the content, just IDs
        });

        // Add this list ID to each bookmark's list array
        for (const bookmark of listBookmarks.bookmarks) {
          const existingLists = bookmarkListMap.get(bookmark.id) || [];
          existingLists.push(list.id);
          bookmarkListMap.set(bookmark.id, existingLists);
        }

        // Handle pagination if there are more bookmarks
        let cursor = listBookmarks.nextCursor;
        while (cursor) {
          const moreBookmarks = await api.bookmarks.getBookmarks({
            listId: list.id,
            cursor,
            limit: 1000,
            includeContent: false,
          });

          for (const bookmark of moreBookmarks.bookmarks) {
            const existingLists = bookmarkListMap.get(bookmark.id) || [];
            existingLists.push(list.id);
            bookmarkListMap.set(bookmark.id, existingLists);
          }

          cursor = moreBookmarks.nextCursor;
        }
      } catch {
        // Skip lists that can't be accessed
      }
    }

    // Default JSON format
    const exportData: z.infer<typeof zExportSchema> = {
      lists: lists.map((list) =>
        toListExportFormat({
          id: list.id,
          name: list.name,
          description: list.description ?? null,
          icon: list.icon,
          type: list.type,
          query: list.query ?? null,
          parentId: list.parentId,
        }),
      ),
      bookmarks: bookmarks
        .map((b) => toExportFormat(b, bookmarkListMap.get(b.id) ?? []))
        .filter((b) => b.content !== null),
    };

    return new Response(JSON.stringify(exportData), {
      status: 200,
      headers: {
        "Content-type": "application/json",
        "Content-disposition": `attachment; filename="karakeep-export-${new Date().toISOString()}.json"`,
      },
    });
  } else if (format === "netscape") {
    // Netscape format
    const netscapeContent = toNetscapeFormat(bookmarks);

    return new Response(netscapeContent, {
      status: 200,
      headers: {
        "Content-type": "text/html",
        "Content-disposition": `attachment; filename="bookmarks-${new Date().toISOString()}.html"`,
      },
    });
  } else {
    return Response.json({ error: "Invalid format" }, { status: 400 });
  }
}
