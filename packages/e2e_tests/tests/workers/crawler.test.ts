import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";
import { getTrpcClient } from "../../utils/trpc";

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

  /**
   * Number of pages in a Chromium-generated PDF, read straight from the raw
   * bytes: the pages root dictionary carries `/Count N`, which mirrors the
   * `/Type /Page` object count. Avoids adding a PDF parser dependency.
   */
  function pdfPageCount(bytes: Uint8Array): number {
    const raw = new TextDecoder("latin1").decode(bytes);
    const counts = [...raw.matchAll(/\/Count (\d+)/g)].map((m) => Number(m[1]));
    return counts.length > 0 ? Math.max(...counts) : 0;
  }

  async function fetchAssetBytes(assetId: string): Promise<Uint8Array> {
    const assetResponse = await fetch(
      `http://localhost:${port}/api/v1/assets/${assetId}`,
      { headers: { authorization: `Bearer ${apiKey}` } },
    );
    expect(assetResponse.ok).toBe(true);
    expect(assetResponse.headers.get("content-type")).toContain(
      "application/pdf",
    );
    return new Uint8Array(await assetResponse.arrayBuffer());
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

  it("should preserve a screen pdf on demand", async () => {
    let { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url: "http://nginx:80/screen-pdf.html",
      },
    });
    assert(bookmark);

    await waitUntil(async () => {
      const data = await getBookmark(bookmark!.id);
      assert(data);
      assert(data.content.type === "link");
      return data.content.crawledAt !== null;
    }, "Bookmark is crawled");

    const trpc = getTrpcClient(apiKey);
    await trpc.bookmarks.recrawlBookmark.mutate({
      bookmarkId: bookmark.id,
      storePdf: true,
      storeScreenPdf: true,
    });

    let pdfAssetId: string | undefined;
    let screenPdfAssetId: string | undefined;
    await waitUntil(
      async () => {
        const data = await getBookmark(bookmark!.id);
        assert(data);
        pdfAssetId = data.assets.find((a) => a.assetType === "pdf")?.id;
        screenPdfAssetId = data.assets.find(
          (a) => a.assetType === "screenPdf",
        )?.id;
        return pdfAssetId !== undefined && screenPdfAssetId !== undefined;
      },
      "Screen PDF is captured",
      120000,
    );
    assert(pdfAssetId);
    assert(screenPdfAssetId);
    expect(pdfAssetId).not.toBe(screenPdfAssetId);

    const printBytes = await fetchAssetBytes(pdfAssetId);
    expect(new TextDecoder().decode(printBytes.slice(0, 4))).toBe("%PDF");

    const screenBytes = await fetchAssetBytes(screenPdfAssetId);
    expect(new TextDecoder().decode(screenBytes.slice(0, 4))).toBe("%PDF");
    // The fixture is ~24,000 CSS px tall (a 100vh hero plus 12 long sections),
    // so the default 19,200px page cap must split it across pages instead of
    // stretching a single page.
    const screenPages = pdfPageCount(screenBytes);
    expect(screenPages).toBeGreaterThanOrEqual(2);
    expect(screenPages).toBeLessThanOrEqual(4);
    expect(screenBytes.byteLength).toBeGreaterThan(5_000);
  });

  it("should clip and paginate very long screen pdfs", async () => {
    let { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url: "http://nginx:80/screen-pdf-long.html",
      },
    });
    assert(bookmark);

    await waitUntil(async () => {
      const data = await getBookmark(bookmark!.id);
      assert(data);
      assert(data.content.type === "link");
      return data.content.crawledAt !== null;
    }, "Bookmark is crawled");

    const trpc = getTrpcClient(apiKey);
    await trpc.bookmarks.recrawlBookmark.mutate({
      bookmarkId: bookmark.id,
      storeScreenPdf: true,
    });

    let screenPdfAssetId: string | undefined;
    await waitUntil(
      async () => {
        const data = await getBookmark(bookmark!.id);
        assert(data);
        screenPdfAssetId = data.assets.find(
          (a) => a.assetType === "screenPdf",
        )?.id;
        return screenPdfAssetId !== undefined;
      },
      "Screen PDF is captured",
      120000,
    );
    assert(screenPdfAssetId);

    const bytes = await fetchAssetBytes(screenPdfAssetId);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    // The fixture is 100,000px tall and the default total cap clips it to
    // 60,000px, which is split into ceil(60,000 / 19,200) = 4 pages of
    // 15,500px each.
    expect(pdfPageCount(bytes)).toBe(4);
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
