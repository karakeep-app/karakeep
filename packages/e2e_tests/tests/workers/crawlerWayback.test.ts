import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";

describe("Crawler Wayback Fallback", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;

  const getBookmark = async (bookmarkId: string) => {
    const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
      params: {
        path: { bookmarkId },
        query: { includeContent: true },
      },
    });
    return data;
  };

  beforeEach(async () => {
    apiKey = await createTestUser();
    client = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it("should fallback to wayback", async () => {
    let { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url: "https://httpstat.us/404",
      },
    });
    assert(bookmark);

    await waitUntil(
      async () => {
        const data = await getBookmark(bookmark!.id);
        assert(data && data.content.type === "link");
        return data.content.crawlStatusCode === 200;
      },
      "Bookmark crawled via wayback",
      30000,
    );

    bookmark = await getBookmark(bookmark.id);
    assert(bookmark && bookmark.content.type === "link");
    expect(bookmark.content.url).toContain("web.archive.org");
    expect(bookmark.content.title).toBeTruthy();
  });
});
