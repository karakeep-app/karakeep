import { randomBytes } from "node:crypto";

import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";

describe("Singlefile archive parsing", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;

  async function getBookmark(bookmarkId: string) {
    const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
      params: {
        path: { bookmarkId },
        query: { includeContent: true },
      },
    });
    return data;
  }

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

  it("parses a large archive with many inline images", async () => {
    // Like a SingleFile save of an image-heavy article: little text, ~45 MB of
    // inline base64 images. Parsed as is, this exhausts the parser's default
    // 512 MB heap.
    const images = Array.from(
      { length: 34 },
      () =>
        `<p>${"Some article text. ".repeat(40)}</p>` +
        `<img src="data:image/png;base64,${randomBytes(1_000_000).toString("base64")}">`,
    );
    const firstImage = images[0].slice(images[0].indexOf("data:"), -2);
    const html =
      "<!doctype html><html><head><title>Inline images</title></head><body>" +
      `<article><h1>Inline images</h1>${images.join("")}</article></body></html>`;

    const formData = new FormData();
    formData.append("url", "https://example.com/inline-images");
    formData.append(
      "file",
      new File([html], "page.html", { type: "text/html" }),
    );
    const response = await fetch(
      `http://localhost:${port}/api/v1/bookmarks/singlefile`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: formData,
      },
    );
    expect(response.status).toBe(201);
    const { id: bookmarkId } = (await response.json()) as { id: string };

    await waitUntil(async () => {
      const data = await getBookmark(bookmarkId);
      assert(data);
      assert(data.content.type === "link");
      return data.content.crawledAt !== null;
    }, "Bookmark is crawled");

    const bookmark = await getBookmark(bookmarkId);
    assert(bookmark && bookmark.content.type === "link");
    expect(bookmark.content.crawlStatus).toBe("success");
    expect(bookmark.content.title).toBe("Inline images");
    // The reader view keeps the images, not the placeholders used while parsing.
    expect(bookmark.content.htmlContent).toContain(firstImage);
    expect(bookmark.content.htmlContent).not.toContain("karakeep.invalid");
  }, 120000);
});
