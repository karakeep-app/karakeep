import {
  toExportFormat,
  toNetscapeFormat,
  zExportSchema,
} from "@/lib/exportBookmarks";
import { api, createContextFromRequest } from "@/server/api/client";
import { z } from "zod";

import { MAX_NUM_BOOKMARKS_PER_PAGE } from "@karakeep/shared/types/bookmarks";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const ctx = await createContextFromRequest(request);
  if (!ctx.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";

  const req = {
    limit: MAX_NUM_BOOKMARKS_PER_PAGE,
    useCursorV2: true,
    includeContent: true,
  };

  let resp = await api.bookmarks.getBookmarks(req);
  let bookmarks = resp.bookmarks;

  while (resp.nextCursor) {
    resp = await api.bookmarks.getBookmarks({
      ...request,
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
        "Content-disposition": `attachment; filename="hoarder-export-${new Date().toISOString()}.json"`,
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
  }
}
