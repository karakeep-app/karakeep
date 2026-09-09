import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";

describe("Crawler Tests", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;

  async function getBookmark(bookmarkId: string) {
    const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
      params: {
        path: {
          bookmarkId,
        },
        query: {
          includeContent: true,
        },
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

  it("should crawl a website", async () => {
    let { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url: "http://nginx:80/hello.html",
      },
    });
    assert(bookmark);

    await waitUntil(async () => {
      const data = await getBookmark(bookmark!.id);
      assert(data);
      assert(data.content.type === "link");
      return data.content.crawledAt !== null;
    }, "Bookmark is crawled");

    bookmark = await getBookmark(bookmark.id);
    assert(bookmark && bookmark.content.type === "link");
    expect(bookmark.content.crawledAt).toBeDefined();
    expect(bookmark.content.htmlContent).toContain("Hello World");
    expect(bookmark.content.title).toContain("My test title");
    expect(bookmark.content.url).toBe("http://nginx:80/hello.html");
    expect(
      bookmark.assets.find((a) => a.assetType === "screenshot"),
    ).toBeDefined();
    expect(bookmark.assets.find((a) => a.assetType === "pdf")).toBeDefined();
  });

  it("should crawl browser-rendered content", async () => {
    let { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url: "http://nginx:80/browser-rendered.html",
      },
    });
    assert(bookmark);

    await waitUntil(async () => {
      const data = await getBookmark(bookmark!.id);
      assert(data);
      assert(data.content.type === "link");
      return data.content.crawledAt !== null;
    }, "Browser-rendered bookmark is crawled");

    bookmark = await getBookmark(bookmark.id);
    assert(bookmark && bookmark.content.type === "link");
    expect(bookmark.content.crawledAt).toBeDefined();
    expect(bookmark.content.htmlContent).toContain(
      "Browser rendered crawler content",
    );
    expect(bookmark.content.htmlContent).not.toContain("Static shell only");
    expect(bookmark.content.title).toContain("Browser rendered title");
    expect(bookmark.content.url).toBe("http://nginx:80/browser-rendered.html");
    expect(
      bookmark.assets.find((a) => a.assetType === "screenshot"),
    ).toBeDefined();
  });

  it("should retain raw and pre-rendered Distill equations in reader content", async () => {
    const { data: created } = await client.POST("/bookmarks", {
      body: { type: "link", url: "http://nginx:80/distill-math.html" },
    });
    assert(created);

    await waitUntil(async () => {
      const bookmark = await getBookmark(created.id);
      assert(bookmark && bookmark.content.type === "link");
      return bookmark.content.crawledAt !== null;
    }, "Math article is crawled");

    const bookmark = await getBookmark(created.id);
    assert(bookmark && bookmark.content.type === "link");
    const html = bookmark.content.htmlContent;
    assert(html);
    expect(html.match(/<math[\s>]/g)).toHaveLength(3);
    expect(html).toContain('display="block"');
    expect(html).toContain("<mi>q</mi>");
    expect(html.match(/<mi>q<\/mi>/g)).toHaveLength(1);
    expect(html).not.toContain("<d-math");
    expect(html).not.toContain("<annotation");
    expect(html).not.toContain("katex-html");
    expect(html).toContain("encoder weights");
  });

  it("should fail crawling a disallowed non-redirect URL", async () => {
    let { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url: "http://127.0.0.1:80/hello.html",
      },
    });
    assert(bookmark);

    await waitUntil(async () => {
      const data = await getBookmark(bookmark!.id);
      assert(data);
      assert(data.content.type === "link");
      return data.content.crawlStatus === "failure";
    }, "Disallowed non-redirect bookmark crawl fails");

    bookmark = await getBookmark(bookmark.id);
    assert(bookmark && bookmark.content.type === "link");
    expect(bookmark.content.crawlStatus).toBe("failure");
    expect(bookmark.content.crawledAt).toBeNull();
    expect(bookmark.content.htmlContent).toBeNull();
  });

  it("should fail crawling a redirect to a disallowed URL", async () => {
    let { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url: "http://nginx:80/redirect-to-loopback",
      },
    });
    assert(bookmark);

    await waitUntil(async () => {
      const data = await getBookmark(bookmark!.id);
      assert(data);
      assert(data.content.type === "link");
      return data.content.crawlStatus === "failure";
    }, "Disallowed redirect bookmark crawl fails");

    bookmark = await getBookmark(bookmark.id);
    assert(bookmark && bookmark.content.type === "link");
    expect(bookmark.content.crawlStatus).toBe("failure");
    expect(bookmark.content.crawledAt).toBeNull();
    expect(bookmark.content.htmlContent).toBeNull();
  });

  it("image lings jobs be converted into images", async () => {
    let { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url: "http://nginx:80/image.png",
      },
    });
    assert(bookmark);

    await waitUntil(async () => {
      const data = await getBookmark(bookmark!.id);
      assert(data);
      return data.content.type === "asset";
    }, "Bookmark is crawled and converted to an image");

    bookmark = await getBookmark(bookmark.id);
    assert(bookmark && bookmark.content.type === "asset");
    expect(bookmark.content.assetType).toBe("image");
    expect(bookmark.content.assetId).toBeDefined();
    expect(bookmark.content.fileName).toBe("image.png");
    expect(bookmark.content.sourceUrl).toBe("http://nginx:80/image.png");
  });
});
