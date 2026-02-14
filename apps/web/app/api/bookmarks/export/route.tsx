import { NextRequest } from "next/server";
import {
  createContextFromRequest,
  createTrcpClientFromCtx,
} from "@/server/api/client";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@karakeep/db";
import { bookmarksInLists } from "@karakeep/db/schema";
import {
  toExportFormat,
  toExportListFormat,
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

  const caller = createTrcpClientFromCtx(() => ctx);

  let resp = await caller.bookmarks.getBookmarks(req);
  let bookmarks = resp.bookmarks;

  while (resp.nextCursor) {
    resp = await caller.bookmarks.getBookmarks({
      ...req,
      cursor: resp.nextCursor,
    });
    bookmarks = [...bookmarks, ...resp.bookmarks];
  }

  if (format === "json") {
    // Fetch lists and bookmark-to-list memberships
    const listsResp = await caller.lists.list();
    const ownedLists = listsResp.lists.filter((l) => l.userRole === "owner");

    const manualLists = ownedLists.filter((l) => l.type === "manual");
    const manualListIds = manualLists.map((l) => l.id);

    let memberships: { bookmarkId: string; listId: string }[] = [];
    if (manualListIds.length > 0) {
      memberships = await db
        .select({
          bookmarkId: bookmarksInLists.bookmarkId,
          listId: bookmarksInLists.listId,
        })
        .from(bookmarksInLists)
        .where(inArray(bookmarksInLists.listId, manualListIds));
    }

    const bookmarkListMap = new Map<string, string[]>();
    for (const m of memberships) {
      const existing = bookmarkListMap.get(m.bookmarkId) ?? [];
      existing.push(m.listId);
      bookmarkListMap.set(m.bookmarkId, existing);
    }

    const exportData: z.infer<typeof zExportSchema> = {
      bookmarks: bookmarks
        .map((b) => toExportFormat(b, bookmarkListMap.get(b.id) ?? []))
        .filter((b) => b.content !== null),
      lists: ownedLists.map(toExportListFormat),
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
