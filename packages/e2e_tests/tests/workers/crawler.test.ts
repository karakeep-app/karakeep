import * as fs from "fs";
import * as path from "path";
import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";
import { getTrpcClient } from "../../utils/trpc";

const e2eDir = path.join(__dirname, "../..");
const imageFixture = fs.readFileSync(path.join(e2eDir, "setup/html/image.png"));
const pdfFixture = fs.readFileSync(path.join(e2eDir, "fixtures/test.pdf"));

// The same tests run against both instances. "local" crawls with its own
// browser. "remote" sends all its crawls to the remote crawler (the crawler
// service in docker-compose.yml) and can't reach the test site or chrome
// itself, so anything it fetched locally would fail.
describe.each([
  { mode: "local", port: inject("karakeepPort") },
  { mode: "remote", port: inject("karakeepRemotePort") },
])("Crawler Tests ($mode)", ({ port }) => {
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

  async function createLinkBookmark(url: string) {
    const { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url,
      },
    });
    assert(bookmark);
    return bookmark;
  }

  /** Waits until done(bookmark) is true, then returns the bookmark. */
  async function waitForBookmark(
    bookmarkId: string,
    description: string,
    done: (
      bookmark: NonNullable<Awaited<ReturnType<typeof getBookmark>>>,
    ) => boolean,
  ) {
    await waitUntil(async () => {
      const data = await getBookmark(bookmarkId);
      assert(data);
      return done(data);
    }, description);
    const bookmark = await getBookmark(bookmarkId);
    assert(bookmark);
    return bookmark;
  }

  async function downloadAsset(assetId: string) {
    const response = await fetch(
      `http://localhost:${port}/api/v1/assets/${assetId}`,
      { headers: { authorization: `Bearer ${apiKey}` } },
    );
    expect(response.status).toBe(200);
    return Buffer.from(await response.arrayBuffer());
  }

  beforeEach(async () => {
    apiKey = await createTestUser(undefined, String(port));
    client = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it("should crawl a website", async () => {
    const created = await createLinkBookmark("http://nginx:80/hello.html");
    const bookmark = await waitForBookmark(
      created.id,
      "Bookmark is crawled",
      (b) => b.content.type === "link" && b.content.crawledAt !== null,
    );
    assert(bookmark.content.type === "link");
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
    const created = await createLinkBookmark(
      "http://nginx:80/browser-rendered.html",
    );
    const bookmark = await waitForBookmark(
      created.id,
      "Browser-rendered bookmark is crawled",
      (b) => b.content.type === "link" && b.content.crawledAt !== null,
    );
    assert(bookmark.content.type === "link");
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

  it("should download the banner image", async () => {
    const created = await createLinkBookmark("http://nginx:80/article.html");
    const bookmark = await waitForBookmark(
      created.id,
      "Bookmark is crawled with its banner image",
      (b) =>
        b.content.type === "link" &&
        b.content.crawledAt !== null &&
        b.assets.some((a) => a.assetType === "bannerImage"),
    );
    assert(bookmark.content.type === "link");
    expect(bookmark.content.title).toBe("Article title");
    expect(bookmark.content.htmlContent).toContain("héllo wörld");
    const banner = bookmark.assets.find((a) => a.assetType === "bannerImage");
    assert(banner);
    // The worker stores a downscaled webp version of the banner.
    const response = await fetch(
      `http://localhost:${port}/api/v1/assets/${banner.id}`,
      { headers: { authorization: `Bearer ${apiKey}` } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^image\//);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("should store a full-page archive", async () => {
    const created = await createLinkBookmark("http://nginx:80/article.html");
    await waitForBookmark(
      created.id,
      "Bookmark is crawled",
      (b) => b.content.type === "link" && b.content.crawledAt !== null,
    );

    await getTrpcClient(apiKey, String(port)).bookmarks.recrawlBookmark.mutate({
      bookmarkId: created.id,
      archiveFullPage: true,
    });
    const bookmark = await waitForBookmark(
      created.id,
      "Bookmark is archived",
      (b) => b.assets.some((a) => a.assetType === "fullPageArchive"),
    );
    const archive = bookmark.assets.find(
      (a) => a.assetType === "fullPageArchive",
    );
    assert(archive);
    const html = (await downloadAsset(archive.id)).toString("utf8");
    expect(html).toContain("Article heading");
    // Monolith inlines the page's image.
    expect(html).toContain("data:image/png;base64,");
  });

  it("should crawl a precrawled archive instead of the live page", async () => {
    const archiveHtml =
      "<!doctype html><html><head><meta charset='utf-8'>" +
      "<title>Précrawled title</title></head><body>" +
      '<p>Précrawled "content" \\ only</p></body></html>';
    const form = new FormData();
    form.append("url", "http://nginx:80/hello.html");
    form.append(
      "file",
      new File([archiveHtml], "archive.html", { type: "text/html" }),
    );
    const response = await fetch(
      `http://localhost:${port}/api/v1/bookmarks/singlefile`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
      },
    );
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };

    const bookmark = await waitForBookmark(
      created.id,
      "Precrawled bookmark is crawled",
      (b) => b.content.type === "link" && b.content.crawledAt !== null,
    );
    assert(bookmark.content.type === "link");
    expect(bookmark.content.title).toBe("Précrawled title");
    expect(bookmark.content.htmlContent).toContain(
      'Précrawled "content" \\ only',
    );
    expect(bookmark.content.htmlContent).not.toContain("Hello World");
    expect(
      bookmark.assets.find((a) => a.assetType === "screenshot"),
    ).toBeDefined();
  });

  it("should fail crawling a disallowed non-redirect URL", async () => {
    const created = await createLinkBookmark("http://127.0.0.1:80/hello.html");
    const bookmark = await waitForBookmark(
      created.id,
      "Disallowed non-redirect bookmark crawl fails",
      (b) => b.content.type === "link" && b.content.crawlStatus === "failure",
    );
    assert(bookmark.content.type === "link");
    expect(bookmark.content.crawlStatus).toBe("failure");
    expect(bookmark.content.crawledAt).toBeNull();
    expect(bookmark.content.htmlContent).toBeNull();
  });

  it("should fail crawling a redirect to a disallowed URL", async () => {
    const created = await createLinkBookmark(
      "http://nginx:80/redirect-to-loopback",
    );
    const bookmark = await waitForBookmark(
      created.id,
      "Disallowed redirect bookmark crawl fails",
      (b) => b.content.type === "link" && b.content.crawlStatus === "failure",
    );
    assert(bookmark.content.type === "link");
    expect(bookmark.content.crawlStatus).toBe("failure");
    expect(bookmark.content.crawledAt).toBeNull();
    expect(bookmark.content.htmlContent).toBeNull();
  });

  it("image lings jobs be converted into images", async () => {
    const created = await createLinkBookmark("http://nginx:80/image.png");
    const bookmark = await waitForBookmark(
      created.id,
      "Bookmark is crawled and converted to an image",
      (b) => b.content.type === "asset",
    );
    assert(bookmark.content.type === "asset");
    expect(bookmark.content.assetType).toBe("image");
    expect(bookmark.content.assetId).toBeDefined();
    expect(bookmark.content.fileName).toBe("image.png");
    expect(bookmark.content.sourceUrl).toBe("http://nginx:80/image.png");
    assert(bookmark.content.assetId);
    expect(
      Buffer.compare(
        await downloadAsset(bookmark.content.assetId),
        imageFixture,
      ),
    ).toBe(0);
  });

  it("should convert PDF links into PDFs", async () => {
    const created = await createLinkBookmark(
      "http://nginx:80/fixtures/test.pdf",
    );
    const bookmark = await waitForBookmark(
      created.id,
      "Bookmark is crawled and converted to a PDF",
      (b) => b.content.type === "asset",
    );
    assert(bookmark.content.type === "asset");
    expect(bookmark.content.assetType).toBe("pdf");
    expect(bookmark.content.fileName).toBe("test.pdf");
    assert(bookmark.content.assetId);
    expect(
      Buffer.compare(await downloadAsset(bookmark.content.assetId), pdfFixture),
    ).toBe(0);
  });
});
