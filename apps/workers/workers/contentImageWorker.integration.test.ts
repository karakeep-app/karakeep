import type { IncomingMessage, Server, ServerResponse } from "http";
import { createServer } from "http";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import {
  contentImageAssetId,
  downloadImage,
  extractExternalImageUrls,
  rewriteImageUrls,
} from "./contentImageWorker";

// ── Mocks ───────────────────────────────────────────────────────────────────
// Only mock modules that require external infrastructure (DB, queues, etc.).
// The network layer (fetchWithProxy, validateUrl) stays REAL.

vi.mock("@karakeep/db", () => ({
  db: {
    query: {
      bookmarks: { findFirst: vi.fn() },
      bookmarkLinks: { findFirst: vi.fn() },
      assets: { findMany: vi.fn().mockResolvedValue([]) },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn() }),
    update: vi
      .fn()
      .mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  },
}));

vi.mock("@karakeep/db/schema", () => ({
  assets: {},
  AssetTypes: { CONTENT_IMAGE: "contentImage" },
  bookmarkLinks: {},
  bookmarks: {},
}));

vi.mock("@karakeep/shared/assetdb", () => ({
  IMAGE_ASSET_TYPES: new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ]),
  deleteAsset: vi.fn(),
  readAsset: vi.fn(),
  saveAsset: vi.fn(),
}));

vi.mock("@karakeep/shared/config", async (original) => {
  const mod = (await original()) as typeof import("@karakeep/shared/config");
  return {
    ...mod,
    default: {
      ...mod.default,
      allowedInternalHostnames: ["localhost", "127.0.0.1"],
      contentImage: { numWorkers: 1, jobTimeoutSec: 120 },
      crawler: {
        storeContentImages: true,
        contentImageMaxCount: 50,
        contentImageMaxSizeMb: 5,
      },
    },
  };
});

vi.mock("@karakeep/shared-server", () => ({
  ContentImageQueue: {},
  QuotaService: {
    checkStorageQuota: vi.fn().mockResolvedValue({ quotaApproved: true }),
  },
  StorageQuotaError: class extends Error {
    name = "StorageQuotaError";
  },
}));

vi.mock("@karakeep/shared/queueing", () => ({
  getQueueClient: vi.fn(),
}));

vi.mock("@karakeep/shared/logger", () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("metrics", () => ({
  workerStatsCounter: { labels: () => ({ inc: vi.fn() }) },
}));

vi.mock("workerTracing", () => ({
  withWorkerTracing: (_name: string, fn: (...args: unknown[]) => unknown) => fn,
}));

// "network" is a baseUrl-relative import (apps/workers/network.ts). Vitest
// only resolves it when mocked; provide a passthrough to the real module.
vi.mock("network", () => import("../network"));

// ── Test image data ─────────────────────────────────────────────────────────
// Minimal buffers with correct magic bytes. They don't need to be renderable
// images — just valid enough for content-type detection and magic byte checks.

function makePng(): Buffer {
  // Minimal valid 1x1 RGBA PNG
  return Buffer.from(
    "89504e470d0a1a0a" + // PNG signature
      "0000000d49484452" + // IHDR chunk length + type
      "00000001" + // width: 1
      "00000001" + // height: 1
      "08060000001f15c489" + // 8-bit RGBA + CRC
      "0000000a4944415478" + // IDAT chunk
      "9c626000000002000198e1938a" + // compressed data + CRC
      "0000000049454e44ae426082", // IEND
    "hex",
  );
}

function makeJpeg(): Buffer {
  // JPEG with SOI + APP0 (JFIF) + minimal structure
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // SOI + APP0 marker
    Buffer.from([0x00, 0x10]), // APP0 length
    Buffer.from("JFIF\0", "ascii"),
    Buffer.alloc(9), // version, units, density, thumbnail
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

function makeGif(): Buffer {
  return Buffer.concat([
    Buffer.from("GIF89a", "ascii"),
    Buffer.from([0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]), // 1x1, no GCT
    Buffer.from([0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]), // image descriptor
    Buffer.from([0x02, 0x02, 0x44, 0x01, 0x00]), // LZW min code size + data
    Buffer.from([0x3b]), // trailer
  ]);
}

function makeWebp(): Buffer {
  // RIFF + WEBP container with minimal VP8 chunk
  const vp8Data = Buffer.alloc(10);
  const fileSize = 4 + 8 + vp8Data.length; // "WEBP" + chunk header + data
  return Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from(new Uint32Array([fileSize]).buffer), // little-endian file size
    Buffer.from("WEBP"),
    Buffer.from("VP8 "),
    Buffer.from(new Uint32Array([vp8Data.length]).buffer),
    vp8Data,
  ]);
}

function makeSvg(): Buffer {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="red" width="1" height="1"/></svg>',
  );
}

function makeAvif(): Buffer {
  // Minimal ftyp box: [size(4)] "ftyp" "avif" [minor_version(4)]
  const boxSize = Buffer.alloc(4);
  boxSize.writeUInt32BE(16);
  return Buffer.concat([
    boxSize,
    Buffer.from("ftyp"),
    Buffer.from("avif"),
    Buffer.alloc(4), // minor version
  ]);
}

// ── Test server ─────────────────────────────────────────────────────────────

interface TestImage {
  buffer: Buffer;
  contentType: string;
}

const TEST_IMAGES: Record<string, TestImage> = {
  "/img/photo.png": { buffer: makePng(), contentType: "image/png" },
  "/img/photo.jpg": { buffer: makeJpeg(), contentType: "image/jpeg" },
  "/img/anim.gif": { buffer: makeGif(), contentType: "image/gif" },
  "/img/icon.webp": { buffer: makeWebp(), contentType: "image/webp" },
  "/img/logo.svg": { buffer: makeSvg(), contentType: "image/svg+xml" },
  "/img/hero.avif": { buffer: makeAvif(), contentType: "image/avif" },
  // Served with wrong Content-Type to test magic byte detection
  "/img/wrong-ct.bin": {
    buffer: makePng(),
    contentType: "application/octet-stream",
  },
  // Different filenames for each lazy-load attribute pattern
  "/img/data-src.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-actualsrc.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-srv.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-original.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-lazy.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-lazy-src.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-lazyload.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-img-src.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-url.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-hires.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-highres.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-fullsrc.png": { buffer: makePng(), contentType: "image/png" },
  "/img/srcset-sm.png": { buffer: makePng(), contentType: "image/png" },
  "/img/srcset-lg.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-srcset-1x.png": { buffer: makePng(), contentType: "image/png" },
  "/img/data-srcset-2x.png": { buffer: makePng(), contentType: "image/png" },
  "/img/lazy-srcset.png": { buffer: makePng(), contentType: "image/png" },
  "/img/svg-image.png": { buffer: makePng(), contentType: "image/png" },
};

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const image = TEST_IMAGES[req.url ?? ""];
  if (image) {
    res.writeHead(200, { "Content-Type": image.contentType });
    res.end(image.buffer);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ── Test suite ──────────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string")
    throw new Error("Failed to bind server");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

function buildTestHtml(): string {
  return `
    <div>
      <!-- Standard src with different image formats -->
      <img src="${baseUrl}/img/photo.png" />
      <img src="${baseUrl}/img/photo.jpg" />
      <img src="${baseUrl}/img/anim.gif" />
      <img src="${baseUrl}/img/icon.webp" />
      <img src="${baseUrl}/img/logo.svg" />
      <img src="${baseUrl}/img/hero.avif" />
      <img src="${baseUrl}/img/wrong-ct.bin" />

      <!-- Lazy-loading data-* attributes (no src or placeholder src) -->
      <img data-src="${baseUrl}/img/data-src.png" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />
      <img data-actualsrc="${baseUrl}/img/data-actualsrc.png" />
      <img data-srv="${baseUrl}/img/data-srv.png" />
      <img data-original="${baseUrl}/img/data-original.png" />
      <img data-lazy="${baseUrl}/img/data-lazy.png" />
      <img data-lazy-src="${baseUrl}/img/data-lazy-src.png" />
      <img data-lazyload="${baseUrl}/img/data-lazyload.png" />
      <img data-img-src="${baseUrl}/img/data-img-src.png" />
      <img data-url="${baseUrl}/img/data-url.png" />

      <!-- High-res attributes -->
      <img data-hi-res-src="${baseUrl}/img/data-hires.png" />
      <img data-highres="${baseUrl}/img/data-highres.png" />
      <img data-full-src="${baseUrl}/img/data-fullsrc.png" />

      <!-- Srcset-format attributes -->
      <img srcset="${baseUrl}/img/srcset-sm.png 300w, ${baseUrl}/img/srcset-lg.png 800w" />
      <img data-srcset="${baseUrl}/img/data-srcset-1x.png 1x, ${baseUrl}/img/data-srcset-2x.png 2x" />
      <img data-lazy-srcset="${baseUrl}/img/lazy-srcset.png 400w" />

      <!-- SVG image element -->
      <svg width="100" height="100">
        <image href="${baseUrl}/img/svg-image.png" width="100" height="100" />
      </svg>
    </div>`;
}

describe("integration: content image pipeline", () => {
  const BOOKMARK_ID = "test-bookmark-integration";
  const JOB_ID = "test-job-integration";
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  test("extractExternalImageUrls finds all image patterns", () => {
    const html = buildTestHtml();
    const urls = extractExternalImageUrls(html);

    // Each pattern should produce exactly one URL
    const expected = [
      // Standard src (7 format variants)
      `${baseUrl}/img/photo.png`,
      `${baseUrl}/img/photo.jpg`,
      `${baseUrl}/img/anim.gif`,
      `${baseUrl}/img/icon.webp`,
      `${baseUrl}/img/logo.svg`,
      `${baseUrl}/img/hero.avif`,
      `${baseUrl}/img/wrong-ct.bin`,
      // Lazy-loading data-* (9 patterns)
      `${baseUrl}/img/data-src.png`,
      `${baseUrl}/img/data-actualsrc.png`,
      `${baseUrl}/img/data-srv.png`,
      `${baseUrl}/img/data-original.png`,
      `${baseUrl}/img/data-lazy.png`,
      `${baseUrl}/img/data-lazy-src.png`,
      `${baseUrl}/img/data-lazyload.png`,
      `${baseUrl}/img/data-img-src.png`,
      `${baseUrl}/img/data-url.png`,
      // High-res (3 patterns)
      `${baseUrl}/img/data-hires.png`,
      `${baseUrl}/img/data-highres.png`,
      `${baseUrl}/img/data-fullsrc.png`,
      // Srcset (picks largest from each: srcset-lg 800w, data-srcset-2x 2x, lazy-srcset 400w)
      `${baseUrl}/img/srcset-lg.png`,
      `${baseUrl}/img/data-srcset-2x.png`,
      `${baseUrl}/img/lazy-srcset.png`,
      // SVG image
      `${baseUrl}/img/svg-image.png`,
    ];

    expect(urls).toHaveLength(expected.length);
    for (const url of expected) {
      expect(urls).toContain(url);
    }
  });

  test("downloadImage fetches real images from HTTP server", async () => {
    const cases: { path: string; expectedType: string }[] = [
      { path: "/img/photo.png", expectedType: "image/png" },
      { path: "/img/photo.jpg", expectedType: "image/jpeg" },
      { path: "/img/anim.gif", expectedType: "image/gif" },
      { path: "/img/icon.webp", expectedType: "image/webp" },
      { path: "/img/logo.svg", expectedType: "image/svg+xml" },
      { path: "/img/hero.avif", expectedType: "image/avif" },
    ];

    for (const { path, expectedType } of cases) {
      const url = `${baseUrl}${path}`;
      const assetId = contentImageAssetId(BOOKMARK_ID, url);
      const result = await downloadImage(url, assetId, JOB_ID, MAX_SIZE, {
        referer: baseUrl,
      });

      expect(result).not.toBeNull();
      expect(result!.contentType).toBe(expectedType);
      expect(result!.buffer.byteLength).toBeGreaterThan(0);
      expect(result!.assetId).toBe(assetId);
      expect(result!.src).toBe(url);
    }
  });

  test("downloadImage detects image type from magic bytes when Content-Type is wrong", async () => {
    const url = `${baseUrl}/img/wrong-ct.bin`;
    const assetId = contentImageAssetId(BOOKMARK_ID, url);
    const result = await downloadImage(url, assetId, JOB_ID, MAX_SIZE, {
      referer: baseUrl,
    });

    expect(result).not.toBeNull();
    // Server sends "application/octet-stream" but buffer contains PNG magic bytes
    expect(result!.contentType).toBe("image/png");
  });

  test("downloadImage returns null for 404", async () => {
    const url = `${baseUrl}/img/nonexistent.png`;
    const assetId = contentImageAssetId(BOOKMARK_ID, url);
    const result = await downloadImage(url, assetId, JOB_ID, MAX_SIZE, {
      referer: baseUrl,
    });
    expect(result).toBeNull();
  });

  test("full pipeline: extract → download → rewrite", async () => {
    const html = buildTestHtml();
    const urls = extractExternalImageUrls(html);
    expect(urls.length).toBeGreaterThan(0);

    // Download all images
    const urlToAssetId = new Map<string, string>();
    for (const url of urls) {
      const assetId = contentImageAssetId(BOOKMARK_ID, url);
      const result = await downloadImage(url, assetId, JOB_ID, MAX_SIZE, {
        referer: baseUrl,
      });
      if (result) {
        urlToAssetId.set(url, assetId);
      }
    }

    // Every URL should have been downloaded successfully
    expect(urlToAssetId.size).toBe(urls.length);

    // Rewrite HTML
    const rewritten = rewriteImageUrls(html, urlToAssetId);

    // No original external URLs should remain
    for (const url of urls) {
      expect(rewritten).not.toContain(url);
    }

    // All asset IDs should be present in rewritten HTML
    for (const assetId of urlToAssetId.values()) {
      expect(rewritten).toContain(`/api/assets/${assetId}`);
    }

    // No lazy-loading attributes should remain
    const lazyAttrs = [
      "data-src",
      "data-actualsrc",
      "data-srv",
      "data-original",
      "data-lazy",
      "data-lazy-src",
      "data-lazyload",
      "data-img-src",
      "data-url",
      "data-hi-res-src",
      "data-highres",
      "data-full-src",
    ];
    for (const attr of lazyAttrs) {
      expect(rewritten).not.toContain(`${attr}=`);
    }

    // No srcset attributes should remain
    expect(rewritten).not.toContain("srcset=");
    expect(rewritten).not.toContain("data-srcset=");
    expect(rewritten).not.toContain("data-lazy-srcset=");
  });
}, 30_000);
