import * as fs from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const dataDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(`${tmpdir()}/karakeep-attachments-`);
  process.env.DATA_DIR = dir;
  process.env.MAX_ASSET_SIZE_MB = "1";
  process.env.NEXTAUTH_SECRET = "test-secret";
  return dir;
});

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { loadAllPlugins } from "@karakeep/shared-server";
import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import { assets, users } from "@karakeep/db/schema";
import type { Context } from "@karakeep/trpc";
import { defaultBeforeEach, getTestQueueMocks } from "@karakeep/trpc/testUtils";
import type { CustomTestContext } from "@karakeep/trpc/testUtils";

import api from "../index";
import { uploadAsset } from "./upload";

beforeEach<CustomTestContext>(defaultBeforeEach(true));
afterAll(() => rm(dataDir, { recursive: true, force: true }));

async function harness(ctx: CustomTestContext, userIndex = 0) {
  const user = await ctx.apiCallers[userIndex].users.whoami();
  const authCtx = {
    db: ctx.db,
    user: { ...user, role: "user" as const },
    auth: { type: "session" as const },
    req: { ip: null },
  };
  const app = new Hono<{ Variables: { ctx: Context } }>()
    .use(async (c, next) => {
      c.set("ctx", authCtx);
      await next();
    })
    .route("/", api);
  return { app, authCtx };
}

async function upload(
  app: Pick<Hono, "request">,
  file: File,
  purpose?: string,
) {
  const body = new FormData();
  body.append("file", file);
  if (purpose) body.append("purpose", purpose);
  return app.request("http://localhost/v1/assets", { method: "POST", body });
}

// Small, valid fixtures; archives are containers, never extracted by the server.
const asciiStl = new TextEncoder().encode(
  "solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle\n",
);
const binaryStl = new Uint8Array(134);
new DataView(binaryStl.buffer).setUint32(80, 1, true);
new DataView(binaryStl.buffer).setFloat32(92, 1, true);
new DataView(binaryStl.buffer).setFloat32(108, 1, true);
new DataView(binaryStl.buffer).setFloat32(124, 1, true);

// Generated with ZIP_STORED: one inert file, correct CRC and central directory.
const zip = Uint8Array.from(
  Buffer.from(
    "UEsDBBQAAAAAAAAAIVAMfn/YBAAAAAQAAAAIAAAAdGVzdC50eHR0ZXN0UEsBAhQDFAAAAAAAAAAhUAx+f9gEAAAABAAAAAgAAAAAAAAAAAAAAIABAAAAAHRlc3QudHh0UEsFBgAAAAABAAEANgAAACoAAAAAAA==",
    "base64",
  ),
);
const threeMf = new Uint8Array(
  await readFile(
    new URL("../../e2e_tests/fixtures/triangle.3mf", import.meta.url),
  ),
);
const fixtures: [string, Uint8Array, string, string][] = [
  ["ascii.stl", asciiStl, "model/stl", "model/stl"],
  ["binary.stl", binaryStl, "", "application/octet-stream"],
  ["triangle.3mf", threeMf, "model/3mf", "model/3mf"],
  ["parameters.stl", asciiStl, "model/stl; charset=utf-8", "model/stl"],
  ["empty.stl", new Uint8Array(84), "model/stl", "model/stl"],
  ["archive.zip", zip, "application/zip", "application/zip"],
  [
    "unknown.bin",
    new Uint8Array([0, 255, 19, 128, 7]),
    "",
    "application/octet-stream",
  ],
];

describe("generic bookmark attachments", () => {
  it<CustomTestContext>("removes persisted bytes and the database row when storage reports a late failure", async (ctx) => {
    const { authCtx } = await harness(ctx);
    await loadAllPlugins();
    const store = await PluginManager.getClient(PluginType.AssetStore);
    const originalSave = store!.saveAssetFromFile.bind(store);
    const save = vi
      .spyOn(store!, "saveAssetFromFile")
      .mockImplementationOnce(async (input) => {
        await originalSave(input);
        throw new Error("Storage write failed");
      });
    try {
      await expect(
        uploadAsset(authCtx.user, ctx.db, {
          file: new File(["solid model"], "model.stl", { type: "model/stl" }),
          purpose: "attachment",
        }),
      ).rejects.toThrow("Storage write failed");
      expect(await ctx.db.select().from(assets)).toEqual([]);
      const { userId, assetId } = save.mock.calls[0][0];
      await expect(store!.getAssetSize({ userId, assetId })).rejects.toThrow();
      await expect(
        store!.readAssetMetadata({ userId, assetId }),
      ).rejects.toThrow();
    } finally {
      save.mockRestore();
    }
  });
  it<CustomTestContext>("removes partial filesystem writes when metadata persistence fails", async (ctx) => {
    const { authCtx } = await harness(ctx);
    await loadAllPlugins();
    const store = (await PluginManager.getClient(PluginType.AssetStore))!;
    const remove = vi.spyOn(store, "deleteAsset");
    const write = vi
      .spyOn(fs.promises, "writeFile")
      .mockRejectedValueOnce(new Error("Disk full"));
    try {
      await expect(
        uploadAsset(authCtx.user, ctx.db, {
          file: new File(["solid model"], "partial.stl", { type: "model/stl" }),
          purpose: "attachment",
        }),
      ).rejects.toThrow("Disk full");
      expect(await ctx.db.select().from(assets)).toEqual([]);
      expect(remove).toHaveBeenCalledOnce();
      await expect(
        store.getAssetSize(remove.mock.calls[0][0]),
      ).rejects.toThrow();
      await expect(
        store.readAssetMetadata(remove.mock.calls[0][0]),
      ).rejects.toThrow();
    } finally {
      write.mockRestore();
      remove.mockRestore();
    }
  });

  it<CustomTestContext>("preserves the original storage error if cleanup also fails", async (ctx) => {
    const { authCtx } = await harness(ctx);
    await loadAllPlugins();
    const store = (await PluginManager.getClient(PluginType.AssetStore))!;
    const save = vi
      .spyOn(store, "saveAssetFromFile")
      .mockRejectedValueOnce(new Error("Original write error"));
    const remove = vi
      .spyOn(store, "deleteAsset")
      .mockRejectedValueOnce(new Error("Cleanup error"));
    try {
      await expect(
        uploadAsset(authCtx.user, ctx.db, {
          file: new File(["solid model"], "failed.stl", { type: "model/stl" }),
          purpose: "attachment",
        }),
      ).rejects.toThrow("Original write error");
      expect(await ctx.db.select().from(assets)).toEqual([]);
      expect(remove).toHaveBeenCalledOnce();
    } finally {
      save.mockRestore();
      remove.mockRestore();
    }
  });

  it<CustomTestContext>("round-trips multiple files without changing bookmark content or processing attachments", async (ctx) => {
    const { app } = await harness(ctx);
    const bookmark = await ctx.apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com/model",
      note: "Keep this note",
    });
    const existing = await (
      await upload(
        app,
        new File(["<html>original archive</html>"], "old.html", {
          type: "text/html",
        }),
      )
    ).json();
    await ctx.apiCallers[0].assets.attachAsset({
      bookmarkId: bookmark.id,
      asset: { id: existing.assetId, assetType: "precrawledArchive" },
    });
    const before = await ctx.apiCallers[0].bookmarks.getBookmark({
      bookmarkId: bookmark.id,
    });
    vi.clearAllMocks();
    const ids: string[] = [];
    for (const [name, bytes, declared, expected] of fixtures) {
      const response = await upload(
        app,
        new File([bytes as Uint8Array<ArrayBuffer>], name, { type: declared }),
        "attachment",
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({
        fileName: name,
        size: bytes.length,
        contentType: expected,
      });
      ids.push(result.assetId);
      const attached = await app.request(
        `http://localhost/v1/bookmarks/${bookmark.id}/assets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: result.assetId,
            assetType: "userUploaded",
          }),
        },
      );
      expect(attached.status).toBe(201);
      for (const url of [
        `/v1/assets/${result.assetId}`,
        (
          await (
            await app.request(
              `http://localhost/v1/assets/${result.assetId}/signed-url`,
            )
          ).json()
        ).signedUrl.replace("http://localhost:3000/api", ""),
      ]) {
        const download = await app.request(`http://localhost${url}`);
        expect(download.status).toBe(200);
        expect(download.headers.get("content-type")).toBe(expected);
        expect(download.headers.get("content-disposition")).toMatch(
          /^attachment;/,
        );
        expect(download.headers.get("x-content-type-options")).toBe("nosniff");
        expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
      }
    }
    const after = await ctx.apiCallers[0].bookmarks.getBookmark({
      bookmarkId: bookmark.id,
    });
    expect(after).toMatchObject({
      id: bookmark.id,
      note: bookmark.note,
      content: before.content,
    });
    expect(after.assets.map((a) => a.id)).toEqual(expect.arrayContaining(ids));
    expect(after.assets).toHaveLength(ids.length + 1);
    expect(after.assets).toEqual(expect.arrayContaining(before.assets));
    expect(
      getTestQueueMocks().assetPreprocessingEnqueue,
    ).not.toHaveBeenCalled();
    expect(getTestQueueMocks().openAIEnqueue).not.toHaveBeenCalled();
    expect(getTestQueueMocks().searchIndexingEnqueue).not.toHaveBeenCalled();
  });

  it<CustomTestContext>("rejects access, attachment and replacement by a foreign user", async (ctx) => {
    const { app } = await harness(ctx);
    const foreign = await harness(ctx, 1);
    const result = await (
      await upload(app, new File([asciiStl], "part.stl"), "attachment")
    ).json();
    const ownBookmark = await ctx.apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "owner",
    });
    const otherBookmark = await ctx.apiCallers[1].bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "other",
    });
    await ctx.apiCallers[0].assets.attachAsset({
      bookmarkId: ownBookmark.id,
      asset: { id: result.assetId, assetType: "userUploaded" },
    });
    expect(
      (
        await foreign.app.request(
          `http://localhost/v1/assets/${result.assetId}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await foreign.app.request(
          `http://localhost/v1/assets/${result.assetId}/signed-url`,
        )
      ).status,
    ).toBe(404);
    await expect(
      ctx.apiCallers[1].assets.attachAsset({
        bookmarkId: otherBookmark.id,
        asset: { id: result.assetId, assetType: "userUploaded" },
      }),
    ).rejects.toThrow();
    await expect(
      ctx.apiCallers[1].assets.replaceAsset({
        bookmarkId: ownBookmark.id,
        oldAssetId: result.assetId,
        newAssetId: result.assetId,
      }),
    ).rejects.toThrow();
    await expect(
      ctx.apiCallers[1].assets.detachAsset({
        bookmarkId: ownBookmark.id,
        assetId: result.assetId,
      }),
    ).rejects.toThrow();
  });

  it<CustomTestContext>("enforces body/file size and storage quota", async (ctx) => {
    const { app, authCtx } = await harness(ctx);
    const huge = new File([new Uint8Array(1024 * 1024 + 1)], "large.bin");
    expect((await upload(app, huge, "attachment")).status).toBe(413);
    expect(
      (
        await upload(
          app,
          new File([new Uint8Array(3 * 1024 * 1024)], "huge.bin"),
          "attachment",
        )
      ).status,
    ).toBe(413);
    await ctx.db
      .update(users)
      .set({ storageQuota: asciiStl.length + 1 })
      .where(eq(users.id, authCtx.user.id));
    expect(
      (await upload(app, new File([asciiStl], "first.stl"), "attachment"))
        .status,
    ).toBe(200);
    expect(
      (await upload(app, new File([asciiStl], "second.stl"), "attachment"))
        .status,
    ).toBe(403);
    await ctx.db
      .update(users)
      .set({ storageQuota: 1 })
      .where(eq(users.id, authCtx.user.id));
    expect(
      (await upload(app, new File([asciiStl], "small.stl"), "attachment"))
        .status,
    ).toBe(403);
  });

  it<CustomTestContext>("preserves unsafe and Unicode names as data without path or header injection", async (ctx) => {
    const { app, authCtx } = await harness(ctx);
    const name = '../..\\模型 "a"\r\nX-Evil: yes.stl';
    // Direct File input preserves controls that multipart transport percent-encodes.
    const result = await uploadAsset(authCtx.user, ctx.db, {
      file: new File([asciiStl], name),
      purpose: "attachment",
    });
    expect(result).toMatchObject({ fileName: name });
    if ("error" in result) throw new Error(result.error);
    expect(
      await readFile(
        `${dataDir}/assets/${authCtx.user.id}/${result.assetId}/asset.bin`,
      ),
    ).toEqual(Buffer.from(asciiStl));
    const response = await app.request(
      `http://localhost/v1/assets/${result.assetId}`,
    );
    expect(response.headers.get("x-evil")).toBeNull();
    expect(response.headers.get("content-disposition")).toContain(
      encodeURIComponent(name).replace(/'/g, "%27"),
    );
  });

  it<CustomTestContext>("rejects spoofed sniffable types and forces active text to download", async (ctx) => {
    const { app } = await harness(ctx);
    for (const type of ["image/png", "application/pdf", "video/mp4"]) {
      expect(
        (
          await upload(
            app,
            new File(["<html><script>alert(1)</script></html>"], "fake.png", {
              type,
            }),
            "attachment",
          )
        ).status,
      ).toBe(400);
    }
    for (const type of [
      "text/html",
      "image/svg+xml",
      "text/plain",
      "text/html\r\nx-evil: yes",
    ]) {
      const result = await (
        await upload(
          app,
          new File(["<script>alert(1)</script>"], "active.html", { type }),
          "attachment",
        )
      ).json();
      const response = await app.request(
        `http://localhost/v1/assets/${result.assetId}`,
      );
      expect(response.headers.get("content-disposition")).toMatch(
        /^attachment;/,
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const partial = await app.request(
        `http://localhost/v1/assets/${result.assetId}`,
        { headers: { Range: "bytes=0-3" } },
      );
      expect(partial.status).toBe(206);
      expect(partial.headers.get("content-disposition")).toMatch(
        /^attachment;/,
      );
      expect(partial.headers.get("x-content-type-options")).toBe("nosniff");
      const bookmark = await ctx.apiCallers[0].bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "keep",
      });
      await expect(
        ctx.apiCallers[0].assets.attachAsset({
          bookmarkId: bookmark.id,
          asset: { id: result.assetId, assetType: "bannerImage" },
        }),
      ).rejects.toThrow(/preview/);
      await expect(
        ctx.apiCallers[0].bookmarks.createBookmark({
          type: BookmarkTypes.LINK,
          url: "https://example.com/archive",
          precrawledArchiveId: result.assetId,
        }),
      ).rejects.toThrow(/page archives/);
      await expect(
        ctx.apiCallers[0].bookmarks.createBookmark({
          type: BookmarkTypes.ASSET,
          assetId: result.assetId,
          assetType: "pdf",
        }),
      ).rejects.toThrow(/Unsupported/);
    }
  });

  it<CustomTestContext>("downloads legacy HTML user attachments without changing page archive delivery", async (ctx) => {
    const { app } = await harness(ctx);
    const bytes = "<html><script>alert(1)</script></html>";
    const result = await (
      await upload(app, new File([bytes], "legacy.html", { type: "text/html" }))
    ).json();
    const url = `http://localhost/v1/assets/${result.assetId}`;
    expect(
      (await app.request(url)).headers.get("content-disposition"),
    ).toBeNull();
    const bookmark = await ctx.apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com/legacy",
      precrawledArchiveId: result.assetId,
    });
    expect(
      (await app.request(url)).headers.get("content-disposition"),
    ).toBeNull();
    await ctx.apiCallers[0].assets.attachAsset({
      bookmarkId: bookmark.id,
      asset: { id: result.assetId, assetType: "userUploaded" },
    });
    const signed = await (await app.request(`${url}/signed-url`)).json();
    const signedUrl = new URL(signed.signedUrl);
    for (const path of [
      url,
      `http://localhost${signedUrl.pathname.replace(/^\/api/, "")}${signedUrl.search}`,
    ]) {
      for (const partial of [false, true]) {
        const headers = new Headers();
        if (partial) headers.set("Range", "bytes=0-3");
        const response = await app.request(path, { headers });
        expect(response.status).toBe(partial ? 206 : 200);
        expect(response.headers.get("content-disposition")).toMatch(
          /^attachment;/,
        );
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(await response.text()).toBe(partial ? bytes.slice(0, 4) : bytes);
      }
    }
  });

  it<CustomTestContext>("keeps legacy uploads and detected PDF/image previews", async (ctx) => {
    const { app } = await harness(ctx);
    expect((await upload(app, new File([asciiStl], "part.stl"))).status).toBe(
      400,
    );
    const pdf = await readFile(
      new URL("../../e2e_tests/fixtures/test.pdf", import.meta.url),
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
      "base64",
    );
    for (const [bytes, type] of [
      [pdf, "application/pdf"],
      [png, "image/png"],
      [
        Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex"),
        "video/mp4",
      ],
    ] as const) {
      const response = await upload(
        app,
        new File([bytes], "preview", { type: "application/zip" }),
        "attachment",
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.contentType).toBe(type);
      const bookmark = await ctx.apiCallers[0].bookmarks.createBookmark({
        type: BookmarkTypes.LINK,
        url: "https://example.com/preview",
      });
      await ctx.apiCallers[0].assets.attachAsset({
        bookmarkId: bookmark.id,
        asset: { id: result.assetId, assetType: "userUploaded" },
      });
      const download = await app.request(
        `http://localhost/v1/assets/${result.assetId}`,
      );
      expect(download.headers.get("content-disposition")).toBeNull();
    }
  });
});
