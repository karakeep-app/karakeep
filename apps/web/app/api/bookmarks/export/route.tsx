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

    // Fetch list memberships for each bookmark
    const bookmarkListMap = new Map<string, string[]>();
    for (const bookmark of bookmarks) {
      try {
        const bookmarkListsResponse = await api.lists.getListsOfBookmark({
          bookmarkId: bookmark.id,
        });
        // Handle both array and object with lists property
        const listArray = Array.isArray(bookmarkListsResponse)
          ? bookmarkListsResponse
          : bookmarkListsResponse.lists ?? [];
        bookmarkListMap.set(
          bookmark.id,
          listArray.map((l: { id: string }) => l.id),
        );
      } catch {
        bookmarkListMap.set(bookmark.id, []);
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
