import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assert,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from "vitest";

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

  it.each([
    ["pdf", 404],
    ["pdf", 410],
    ["image", 404],
    ["image", 410],
  ])(
    "preserves a saved copy when an %s probe is followed by HTTP %i",
    async (assetType, status) => {
      const name = `asset-recrawl-${randomUUID()}.html`;
      const fixtureDir = new URL("../../setup/html/", import.meta.url);
      const fixturePath = fileURLToPath(new URL(name, fixtureDir));
      await writeFile(
        fixturePath,
        await readFile(new URL("hello.html", fixtureDir)),
        {
          flag: "wx",
        },
      );
      let fixtureExists = true;
      try {
        const { data: created } = await client.POST("/bookmarks", {
          body: {
            type: "link",
            url: `http://nginx:80/missing-${assetType}-${status}-${name}`,
          },
        });
        assert(created);
        const bookmarkId = created.id;
        await waitUntil(async () => {
          const bookmark = await getBookmark(bookmarkId);
          return (
            bookmark?.content.type === "link" &&
            bookmark.content.crawlStatus === "success"
          );
        }, "initial crawl completes");
        const trpc = getTrpcClient(apiKey);
        await trpc.bookmarks.recrawlBookmark.mutate({
          bookmarkId,
          archiveFullPage: true,
          storePdf: true,
        });
        await waitUntil(async () => {
          const bookmark = await getBookmark(bookmarkId);
          return (
            bookmark?.content.type === "link" &&
            bookmark.content.crawlStatus === "success" &&
            bookmark.assets.some(
              (asset) => asset.assetType === "fullPageArchive",
            )
          );
        }, "initial offline archive completes");
        const before = await getBookmark(bookmarkId);
        assert(before && before.content.type === "link");
        const savedAssets = before.assets.filter((asset) =>
          ["screenshot", "pdf", "fullPageArchive"].includes(asset.assetType),
        );
        expect(savedAssets).toHaveLength(3);
        const readAsset = async (id: string) => {
          const response = await fetch(
            `http://localhost:${port}/api/v1/assets/${id}`,
            {
              headers: { authorization: `Bearer ${apiKey}` },
            },
          );
          expect(response.status).toBe(200);
          return Buffer.from(await response.arrayBuffer());
        };
        const savedBytes = await Promise.all(
          savedAssets.map((asset) => readAsset(asset.id)),
        );
        await unlink(fixturePath);
        fixtureExists = false;
        await trpc.bookmarks.recrawlBookmark.mutate({
          bookmarkId,
          archiveFullPage: true,
          storePdf: true,
        });
        await waitUntil(async () => {
          const bookmark = await getBookmark(bookmarkId);
          return (
            bookmark?.content.type === "link" &&
            bookmark.content.crawlStatus === "failure"
          );
        }, "asset download failure completes");
        const after = await getBookmark(bookmarkId);
        assert(after && after.content.type === "link");
        expect(after.content.title).toBe(before.content.title);
        expect(after.content.htmlContent).toBe(before.content.htmlContent);
        expect(after.assets).toEqual(before.assets);
        for (const [index, asset] of savedAssets.entries()) {
          expect(await readAsset(asset.id)).toEqual(savedBytes[index]);
        }
        const brokenLinks = await trpc.bookmarks.getBrokenLinks.query();
        expect(
          brokenLinks.bookmarks.find((item) => item.id === bookmarkId),
        ).toMatchObject({ statusCode: status, isCrawlingFailure: true });
      } finally {
        if (fixtureExists) await unlink(fixturePath);
      }
    },
    180_000,
  );

  it.each([404, 410])(
    "preserves saved copies when a recrawl returns %i",
    async (status) => {
      const name = `recrawl-${randomUUID()}.html`;
      const fixtureDir = new URL("../../setup/html/", import.meta.url);
      const fixturePath = fileURLToPath(new URL(name, fixtureDir));
      const html = await readFile(new URL("hello.html", fixtureDir));
      await writeFile(fixturePath, html, { flag: "wx" });
      let fixtureExists = true;
      try {
        const url = `http://nginx:80/${status === 410 ? "gone-" : ""}${name}`;
        const { data: created } = await client.POST("/bookmarks", {
          body: { type: "link", url },
        });
        assert(created);
        const bookmarkId = created.id;
        await waitUntil(async () => {
          const bookmark = await getBookmark(bookmarkId);
          return (
            bookmark?.content.type === "link" &&
            bookmark.content.crawlStatus === "success"
          );
        }, "initial crawl completes");

        const trpc = getTrpcClient(apiKey);
        await trpc.bookmarks.recrawlBookmark.mutate({
          bookmarkId,
          archiveFullPage: true,
          storePdf: true,
        });
        await waitUntil(async () => {
          const bookmark = await getBookmark(bookmarkId);
          return (
            bookmark?.content.type === "link" &&
            bookmark.content.crawlStatus === "success" &&
            bookmark.assets.some(
              (asset) => asset.assetType === "fullPageArchive",
            )
          );
        }, "initial offline archive completes");

        const before = await getBookmark(bookmarkId);
        assert(before && before.content.type === "link");
        expect(before.content.htmlContent).toContain("Hello World");
        const savedAssets = before.assets.filter((asset) =>
          ["screenshot", "pdf", "fullPageArchive"].includes(asset.assetType),
        );
        expect(savedAssets).toHaveLength(3);
        const readAsset = async (id: string) => {
          const response = await fetch(
            `http://localhost:${port}/api/v1/assets/${id}`,
            {
              headers: { authorization: `Bearer ${apiKey}` },
            },
          );
          expect(response.status).toBe(200);
          return Buffer.from(await response.arrayBuffer());
        };
        const savedBytes = await Promise.all(
          savedAssets.map((asset) => readAsset(asset.id)),
        );

        await unlink(fixturePath);
        fixtureExists = false;
        await trpc.bookmarks.recrawlBookmark.mutate({
          bookmarkId,
          archiveFullPage: true,
          storePdf: true,
        });
        await waitUntil(async () => {
          const bookmark = await getBookmark(bookmarkId);
          return (
            bookmark?.content.type === "link" &&
            bookmark.content.crawlStatus === "failure"
          );
        }, `recrawl returning ${status} completes`);

        const after = await getBookmark(bookmarkId);
        assert(after && after.content.type === "link");
        expect(after.content.title).toBe(before.content.title);
        expect(after.content.htmlContent).toBe(before.content.htmlContent);
        expect(after.content.crawledAt).toEqual(before.content.crawledAt);
        expect(after.assets).toEqual(before.assets);
        for (const [index, asset] of savedAssets.entries()) {
          expect(await readAsset(asset.id)).toEqual(savedBytes[index]);
        }
        const brokenLinks = await trpc.bookmarks.getBrokenLinks.query();
        expect(
          brokenLinks.bookmarks.find((item) => item.id === bookmarkId),
        ).toMatchObject({
          statusCode: status,
          isCrawlingFailure: true,
        });

        // Once the source returns, a normal recrawl should still update it.
        await writeFile(
          fixturePath,
          html.toString().replace("My test title", "Updated test title"),
          { flag: "wx" },
        );
        fixtureExists = true;
        await trpc.bookmarks.recrawlBookmark.mutate({
          bookmarkId,
          storePdf: true,
        });
        await waitUntil(async () => {
          const bookmark = await getBookmark(bookmarkId);
          return (
            bookmark?.content.type === "link" &&
            bookmark.content.crawlStatus === "success" &&
            bookmark.content.title === "Updated test title"
          );
        }, "successful recrawl updates the copy");
      } finally {
        if (fixtureExists) {
          await unlink(fixturePath);
        }
      }
    },
    180_000,
  );

  it.each([404, 410])(
    "still processes a first crawl returning %i",
    async (status) => {
      const name = `missing-${randomUUID()}.html`;
      const url = `http://nginx:80/${status === 410 ? "gone-" : ""}${name}`;
      const { data: created } = await client.POST("/bookmarks", {
        body: { type: "link", url },
      });
      assert(created);
      await waitUntil(async () => {
        const bookmark = await getBookmark(created.id);
        return (
          bookmark?.content.type === "link" &&
          bookmark.content.crawlStatus === "success"
        );
      }, "first crawl of missing page completes");
      const brokenLinks =
        await getTrpcClient(apiKey).bookmarks.getBrokenLinks.query();
      expect(
        brokenLinks.bookmarks.find((item) => item.id === created.id),
      ).toMatchObject({
        statusCode: status,
        isCrawlingFailure: false,
      });
    },
    90_000,
  );

  describe("concurrent first crawls", () => {
    const fixturePort = inject("crawlerRacePort");
    const fixtureUrl = `http://localhost:${fixturePort}`;

    beforeAll(async () => {
      execFileSync(
        "docker",
        ["compose", "exec", "-d", "web", "node", "/crawler-race-fixture.mjs"],
        {
          cwd: fileURLToPath(new URL("../../", import.meta.url)),
        },
      );
      await waitUntil(
        async () => (await fetch(`${fixtureUrl}/health`)).ok,
        "race fixture is ready",
      );
    });

    async function control(id: string, action = "") {
      const response = await fetch(`${fixtureUrl}/control/${id}${action}`);
      if (!response.ok)
        throw new Error(`Race fixture failed: ${response.status}`);
      return response;
    }

    async function readAsset(id: string) {
      const response = await fetch(
        `http://localhost:${port}/api/v1/assets/${id}`,
        {
          headers: { authorization: `Bearer ${apiKey}` },
        },
      );
      expect(response.status).toBe(200);
      return Buffer.from(await response.arrayBuffer());
    }

    it("keeps metadata edited after the initial metadata write", async () => {
      const id = randomUUID();
      await control(id, "/init?mode=metadata-edit");
      const { data: created } = await client.POST("/bookmarks", {
        body: { type: "link", url: `http://nginx/crawl-race/${id}/page` },
      });
      assert(created);
      try {
        await waitUntil(
          async () => (await (await control(id)).json()).bannerWaiting === true,
          "crawl pauses after writing its metadata",
        );
        const before = await getBookmark(created.id);
        assert(before && before.content.type === "link");
        expect(before.content.description).toBe("Original description");
        const trpc = getTrpcClient(apiKey);
        await trpc.bookmarks.updateBookmark.mutate({
          bookmarkId: created.id,
          description: "User-edited description",
          author: "User-edited author",
        });
        await control(id, "/release_banner");
        await waitUntil(async () => {
          const bookmark = await getBookmark(created.id);
          return (
            bookmark?.content.type === "link" &&
            bookmark.content.crawlStatus === "success"
          );
        }, "crawl finishes after the metadata edit");
        const after = await getBookmark(created.id);
        assert(after && after.content.type === "link");
        expect(after.content.description).toBe("User-edited description");
        expect(after.content.author).toBe("User-edited author");
        expect(after.content.htmlContent).toContain("Reliable saved content");
      } finally {
        await control(id, "/release_banner");
      }
    }, 180_000);

    it.each([404, 410])(
      "keeps a copy saved after the initial HTTP %i check",
      async (status) => {
        const id = randomUUID();
        await control(id, `/init?mode=late&status=${status}`);
        const { data: created } = await client.POST("/bookmarks", {
          body: { type: "link", url: `http://nginx/crawl-race/${id}/page` },
        });
        assert(created);
        try {
          await waitUntil(
            async () =>
              (await (await control(id)).json()).bannerWaiting === true,
            "missing crawl pauses after its initial check",
          );
          const initial = await getBookmark(created.id);
          assert(initial && initial.content.type === "link");
          expect(initial.content.crawledAt).toBeNull();
          const trpc = getTrpcClient(apiKey);
          await trpc.bookmarks.recrawlBookmark.mutate({
            bookmarkId: created.id,
            archiveFullPage: true,
            storePdf: true,
          });
          await waitUntil(async () => {
            const b = await getBookmark(created.id);
            return (
              b?.content.type === "link" &&
              b.content.crawlStatus === "success" &&
              b.content.title === "Good title" &&
              b.assets.some((a) => a.assetType === "fullPageArchive")
            );
          }, "concurrent good copy is saved");
          const good = await getBookmark(created.id);
          assert(good && good.content.type === "link");
          const goodHtmlContent = good.content.htmlContent;
          const copies = good.assets.filter((a) =>
            ["screenshot", "pdf", "fullPageArchive"].includes(a.assetType),
          );
          expect(copies).toHaveLength(3);
          const bytes = await Promise.all(copies.map((a) => readAsset(a.id)));
          await control(id, "/release_banner");
          await waitUntil(async () => {
            const b = await getBookmark(created.id);
            return (
              b?.content.type === "link" &&
              (b.content.crawlStatus === "failure" ||
                b.content.htmlContent !== goodHtmlContent)
            );
          }, "late missing crawl finishes");
          const after = await getBookmark(created.id);
          assert(after && after.content.type === "link");
          expect(after.content.crawlStatus).toBe("failure");
          expect(after.content.title).toBe(good.content.title);
          expect(after.content.htmlContent).toBe(good.content.htmlContent);
          expect(after.assets).toEqual(good.assets);
          for (const [index, asset] of copies.entries())
            expect(await readAsset(asset.id)).toEqual(bytes[index]);
          const broken = await trpc.bookmarks.getBrokenLinks.query();
          expect(
            broken.bookmarks.find((b) => b.id === created.id),
          ).toMatchObject({ statusCode: status, isCrawlingFailure: true });
        } finally {
          await control(id, "/release_banner");
        }
      },
      180_000,
    );

    it("does not write late probe metadata after another crawl saves a copy", async () => {
      const id = randomUUID();
      await control(id, "/init?mode=probe-late&status=404");
      const { data: created } = await client.POST("/bookmarks", {
        body: { type: "link", url: `http://nginx/crawl-race/${id}/page` },
      });
      assert(created);
      try {
        await waitUntil(async () => {
          const state = await (await control(id)).json();
          return state.probeWaiting && state.missingWaiting;
        }, "first probe and browser response are held");
        await control(id, "/release_missing");
        let missingJob = "";
        const crawlerLogs = () =>
          execFileSync("docker", ["compose", "logs", "--no-color", "web"], {
            cwd: fileURLToPath(new URL("../../", import.meta.url)),
            encoding: "utf8",
          });
        await waitUntil(async () => {
          const logs = crawlerLogs();
          const start = logs
            .split("\n")
            .find(
              (line) =>
                line.includes(`crawl-race/${id}/page`) &&
                line.includes("Will crawl"),
            );
          missingJob = start?.match(/\[Crawler\]\[([^\]]+)\]/)?.[1] ?? "";
          return Boolean(
            missingJob &&
            logs.includes(
              `[Crawler][${missingJob}] Parse subprocess completed successfully.`,
            ),
          );
        }, "missing crawl passes its first check and waits for the probe");
        const trpc = getTrpcClient(apiKey);
        await trpc.bookmarks.recrawlBookmark.mutate({
          bookmarkId: created.id,
          archiveFullPage: true,
          storePdf: true,
        });
        await waitUntil(async () => {
          const b = await getBookmark(created.id);
          return (
            b?.content.type === "link" &&
            b.content.crawlStatus === "success" &&
            b.content.title === "Good title" &&
            b.assets.some((a) => a.assetType === "fullPageArchive")
          );
        }, "good copy is saved before the first probe finishes");
        const good = await getBookmark(created.id);
        assert(good && good.content.type === "link");
        expect(good.content.imageUrl).toBeNull();
        await control(id, "/release_probe");
        await waitUntil(async () => {
          const b = await getBookmark(created.id);
          return (
            b?.content.type === "link" && b.content.crawlStatus === "failure"
          );
        }, "missing browser crawl preserves the copy");
        const logs = crawlerLogs();
        expect(logs).toContain(
          `[Crawler][${missingJob}] Extracted page metadata from the content-type probe`,
        );
        expect(logs).not.toContain(
          `[Crawler][${missingJob}] Wrote early metadata from the content-type probe.`,
        );
        const after = await getBookmark(created.id);
        assert(after && after.content.type === "link");
        expect(after.content.imageUrl).toBe(good.content.imageUrl);
        expect(after.content.title).toBe(good.content.title);
        expect(after.content.htmlContent).toBe(good.content.htmlContent);
        expect(after.assets).toEqual(good.assets);
      } finally {
        await control(id, "/release_missing");
        await control(id, "/release_probe");
      }
    }, 180_000);

    it.each([404, 410])(
      "replaces an initial HTTP %i copy when the already-running good crawl finishes",
      async (status) => {
        const id = randomUUID();
        await control(id, `/init?mode=reverse&status=${status}`);
        const { data: created } = await client.POST("/bookmarks", {
          body: { type: "link", url: `http://nginx/crawl-race/${id}/page` },
        });
        assert(created);
        try {
          await waitUntil(
            async () => (await (await control(id)).json()).browserRequests >= 1,
            "missing browser crawl begins",
          );
          const trpc = getTrpcClient(apiKey);
          await trpc.bookmarks.recrawlBookmark.mutate({
            bookmarkId: created.id,
            archiveFullPage: true,
            storePdf: true,
          });
          await waitUntil(
            async () => (await (await control(id)).json()).goodWaiting === true,
            "good crawl waits before saving",
          );
          await waitUntil(async () => {
            const b = await getBookmark(created.id);
            const broken = await trpc.bookmarks.getBrokenLinks.query();
            return (
              b?.content.type === "link" &&
              b.content.crawlStatus === "success" &&
              b.content.title === "Missing error title" &&
              broken.bookmarks.some(
                (item) => item.id === created.id && item.statusCode === status,
              )
            );
          }, "initial missing copy is saved");
          const before = await getBookmark(created.id);
          assert(before && before.content.type === "link");
          const old = before.assets.filter((a) =>
            ["screenshot", "pdf"].includes(a.assetType),
          );
          expect(old).toHaveLength(2);
          await control(id, "/release_good");
          await waitUntil(async () => {
            const b = await getBookmark(created.id);
            return (
              b?.content.type === "link" &&
              b.content.crawlStatus === "success" &&
              b.content.title === "Good title" &&
              b.assets.some((a) => a.assetType === "fullPageArchive")
            );
          }, "good copy replaces missing page");
          const after = await getBookmark(created.id);
          assert(after && after.content.type === "link");
          expect(after.content.htmlContent).toContain("Reliable saved content");
          const copies = after.assets.filter((a) =>
            ["screenshot", "pdf", "fullPageArchive"].includes(a.assetType),
          );
          expect(copies).toHaveLength(3);
          expect(
            copies.some((a) => old.some((oldAsset) => oldAsset.id === a.id)),
          ).toBe(false);
          await Promise.all(copies.map((a) => readAsset(a.id)));
        } finally {
          await control(id, "/release_good");
        }
      },
      180_000,
    );
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
