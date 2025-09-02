import { NextRequest } from "next/server";
import { api, createContextFromRequest } from "@/server/api/client";
import { z } from "zod";

import {
  toExportFormat,
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
    // Default JSON format
    const exportData: z.infer<typeof zExportSchema> = {
      bookmarks: bookmarks
        .map(toExportFormat)
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
