import type { Settings } from "../lib/settings";
import { z } from "zod";

import { buildApiHeaders } from "../lib/utils";

export const DEFAULT_WIDGET_QUERY = "-is:archived";
export const SEARCH_WIDGET_NAME = "KarakeepSearch";

const zSearchResponse = z.object({
  bookmarks: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullish(),
      tags: z.array(z.object({ name: z.string() })),
      content: z.object({
        type: z.string(),
        title: z.string().nullish(),
        url: z.string().optional(),
        fileName: z.string().nullish(),
      }),
    }),
  ),
});

export interface WidgetBookmark {
  id: string;
  title: string;
  metadata: string;
}

export interface SearchWidgetData {
  bookmarks: WidgetBookmark[];
  message?: string;
}

export async function searchWidgetBookmarks(
  settings: Pick<
    Settings,
    "apiKey" | "address" | "customHeaders" | "widgetSearchQuery"
  >,
  signal: AbortSignal,
): Promise<SearchWidgetData> {
  if (!settings.apiKey) {
    return { bookmarks: [], message: "Open Karakeep to sign in." };
  }

  const url = new URL(
    `${settings.address.replace(/\/+$/, "")}/api/v1/bookmarks/search`,
  );
  url.searchParams.set("q", settings.widgetSearchQuery);
  url.searchParams.set("limit", "50");
  url.searchParams.set("includeContent", "false");
  const response = await fetch(url.toString(), {
    headers: buildApiHeaders(settings.apiKey, settings.customHeaders),
    signal,
  });
  if (!response.ok) {
    return {
      bookmarks: [],
      message:
        response.status === 401 || response.status === 403
          ? "Open Karakeep to check your sign-in and server access."
          : response.status === 400
            ? "Check the search query in widget settings."
            : "Couldn't load bookmarks. Tap refresh to retry.",
    };
  }

  const { bookmarks } = zSearchResponse.parse(await response.json());
  return {
    bookmarks: bookmarks.map(({ id, title, content, tags }) => {
      let domain = "";
      if (content.url) {
        try {
          domain = new URL(content.url).hostname;
        } catch {
          // A malformed saved URL must not hide the other search results.
        }
      }
      return {
        id,
        title:
          title?.trim() ||
          content.title?.trim() ||
          content.fileName ||
          content.url ||
          (content.type === "text" ? "Text bookmark" : "Untitled bookmark"),
        metadata: [domain, ...tags.map(({ name }) => `#${name}`)]
          .filter(Boolean)
          .join(" · "),
      };
    }),
    ...(bookmarks.length === 0 ? { message: "No matching bookmarks." } : {}),
  };
}
