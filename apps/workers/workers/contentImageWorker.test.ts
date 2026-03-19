import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  contentImageAssetId,
  detectImageType,
  downloadImage,
  extractExternalImageUrls,
  pickLargestSrcsetUrl,
  resolveHtmlContent,
  rewriteImageUrls,
  run,
} from "./contentImageWorker";

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@karakeep/db", () => ({
  db: {
    query: {
      bookmarks: { findFirst: vi.fn() },
      bookmarkLinks: { findFirst: vi.fn() },
      assets: { findMany: vi.fn().mockResolvedValue([]) },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn(),
      }),
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
  SUPPORTED_CONTENT_IMAGE_TYPES: new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/avif",
    "image/apng",
  ]),
  deleteAsset: vi.fn(),
  readAsset: vi.fn(),
  saveAsset: vi.fn(),
}));

vi.mock("@karakeep/shared/config", () => ({
  default: {
    contentImage: { numWorkers: 1, jobTimeoutSec: 120 },
    crawler: {
      storeContentImages: true,
      contentImageMaxCount: 50,
      contentImageMaxSizeMb: 5,
    },
  },
}));

vi.mock("@karakeep/shared-server", () => ({
  ContentImageQueue: {},
  QuotaService: {
    checkStorageQuota: vi.fn().mockResolvedValue({ quotaApproved: true }),
  },
  StorageQuotaError: class StorageQuotaError extends Error {
    name = "StorageQuotaError";
    constructor(
      public used: number,
      public limit: number,
      public requested: number,
    ) {
      super(
        `Storage quota exceeded: used ${used}, limit ${limit}, requested ${requested}`,
      );
    }
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

const mockValidateUrl = vi.fn();
const mockFetchWithProxy = vi.fn();
vi.mock("network", () => ({
  validateUrl: (...args: unknown[]) => mockValidateUrl(...args),
  fetchWithProxy: (...args: unknown[]) => mockFetchWithProxy(...args),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeJob(bookmarkId: string) {
  return {
    id: "test-job-1",
    data: { bookmarkId },
    priority: 0,
    runNumber: 1,
    numRetriesLeft: 2,
    abortSignal: new AbortController().signal,
  } as Parameters<typeof run>[0];
}

function mockResponse(
  body: ArrayBuffer,
  contentType: string,
  status = 200,
  contentLength?: string,
) {
  const headers = new Map<string, string>();
  headers.set("content-type", contentType);
  if (contentLength) headers.set("content-length", contentLength);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name) ?? null },
    arrayBuffer: () => Promise.resolve(body),
  };
}

// Mock handle type — vi.fn() with additional mock methods
type MockFn = ReturnType<typeof vi.fn>;
interface MockDb {
  query: {
    bookmarks: { findFirst: MockFn };
    bookmarkLinks: { findFirst: MockFn };
    assets: { findMany: MockFn };
  };
  insert: MockFn;
  delete: MockFn;
  update: MockFn;
}

// Retrieve mocked modules once for use in run() tests.
// vi.mock hoists above imports, so these are the mocked versions.
let mockDb: MockDb;
let mockAssetDb: { deleteAsset: MockFn; saveAsset: MockFn; readAsset: MockFn };
let mockConfig: {
  crawler: {
    storeContentImages: boolean;
    contentImageMaxCount: number;
    contentImageMaxSizeMb: number;
  };
};
let mockQuotaService: { checkStorageQuota: MockFn };

// ── Tests ───────────────────────────────────────────────────────────────────

describe("extractExternalImageUrls", () => {
  test("extracts http and https image URLs", () => {
    const html = `
      <div>
        <img src="https://example.com/photo.jpg" />
        <img src="http://cdn.test.com/banner.png" />
      </div>`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://example.com/photo.jpg",
      "http://cdn.test.com/banner.png",
    ]);
  });

  test("skips data URIs", () => {
    const html = `<img src="data:image/png;base64,iVBOR..." />`;
    expect(extractExternalImageUrls(html)).toEqual([]);
  });

  test("skips already-rewritten asset URLs", () => {
    const html = `<img src="/api/assets/abc-123" />`;
    expect(extractExternalImageUrls(html)).toEqual([]);
  });

  test("skips relative URLs", () => {
    const html = `<img src="/images/logo.png" /><img src="logo.png" />`;
    expect(extractExternalImageUrls(html)).toEqual([]);
  });

  test("skips img tags without src", () => {
    const html = `<img alt="no src" />`;
    expect(extractExternalImageUrls(html)).toEqual([]);
  });

  test("returns empty array for HTML with no images", () => {
    const html = `<p>No images here</p>`;
    expect(extractExternalImageUrls(html)).toEqual([]);
  });

  test("handles mixed URLs correctly", () => {
    const html = `
      <img src="https://a.com/1.jpg" />
      <img src="data:image/gif;base64,R0lGOD..." />
      <img src="/api/assets/existing-id" />
      <img src="/relative.png" />
      <img src="http://b.com/2.png" />`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://a.com/1.jpg",
      "http://b.com/2.png",
    ]);
  });

  test("deduplicates identical URLs", () => {
    const html = `
      <img src="https://example.com/photo.jpg" />
      <img src="https://example.com/photo.jpg" />
      <img src="https://other.com/img.png" />
      <img src="https://example.com/photo.jpg" />`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://example.com/photo.jpg",
      "https://other.com/img.png",
    ]);
  });

  test("extracts data-src for lazy-loaded images", () => {
    const html = `<img data-src="https://example.com/lazy.jpg" src="data:image/gif;base64,placeholder" />`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://example.com/lazy.jpg",
    ]);
  });

  test("prefers data-src over src when both are external", () => {
    const html = `<img data-src="https://example.com/real.jpg" src="https://example.com/thumb.jpg" />`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://example.com/real.jpg",
    ]);
  });

  test("extracts data-lazy-src and data-original", () => {
    const html = `
      <img data-lazy-src="https://a.com/lazy.jpg" />
      <img data-original="https://b.com/orig.jpg" />`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://a.com/lazy.jpg",
      "https://b.com/orig.jpg",
    ]);
  });

  test("extracts all supported lazy-loading attributes", () => {
    const html = `
      <img data-actualsrc="https://a.com/actualsrc.jpg" />
      <img data-srv="https://a.com/srv.jpg" />
      <img data-lazy="https://a.com/lazy.jpg" />
      <img data-lazyload="https://a.com/lazyload.jpg" />
      <img data-img-src="https://a.com/imgsrc.jpg" />
      <img data-url="https://a.com/url.jpg" />`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://a.com/actualsrc.jpg",
      "https://a.com/srv.jpg",
      "https://a.com/lazy.jpg",
      "https://a.com/lazyload.jpg",
      "https://a.com/imgsrc.jpg",
      "https://a.com/url.jpg",
    ]);
  });

  test("falls back to src when data-src is not external", () => {
    const html = `<img data-src="/local/path.jpg" src="https://example.com/photo.jpg" />`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://example.com/photo.jpg",
    ]);
  });

  test("extracts from img without src but with data-src", () => {
    const html = `<img data-src="https://example.com/nosrc.jpg" />`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://example.com/nosrc.jpg",
    ]);
  });

  test("extracts high-res lazy attributes", () => {
    const html = `
      <img data-hi-res-src="https://a.com/hires.jpg" />
      <img data-highres="https://b.com/highres.jpg" />
      <img data-full-src="https://c.com/full.jpg" />`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://a.com/hires.jpg",
      "https://b.com/highres.jpg",
      "https://c.com/full.jpg",
    ]);
  });

  test("falls back to srcset when no src or data-* attrs", () => {
    const html = `<img srcset="https://a.com/sm.jpg 300w, https://a.com/lg.jpg 800w" />`;
    expect(extractExternalImageUrls(html)).toEqual(["https://a.com/lg.jpg"]);
  });

  test("falls back to data-srcset when no src or data-* attrs", () => {
    const html = `<img data-srcset="https://a.com/sm.jpg 1x, https://a.com/lg.jpg 2x" />`;
    expect(extractExternalImageUrls(html)).toEqual(["https://a.com/lg.jpg"]);
  });

  test("falls back to data-lazy-srcset", () => {
    const html = `<img data-lazy-srcset="https://a.com/only.jpg 400w" />`;
    expect(extractExternalImageUrls(html)).toEqual(["https://a.com/only.jpg"]);
  });

  test("prefers data-src over srcset", () => {
    const html = `<img data-src="https://a.com/lazy.jpg" srcset="https://a.com/lg.jpg 800w" />`;
    expect(extractExternalImageUrls(html)).toEqual(["https://a.com/lazy.jpg"]);
  });

  test("prefers src over srcset", () => {
    const html = `<img src="https://a.com/src.jpg" srcset="https://a.com/lg.jpg 800w" />`;
    expect(extractExternalImageUrls(html)).toEqual(["https://a.com/src.jpg"]);
  });

  test("extracts SVG image href", () => {
    const html = `<svg><image href="https://a.com/diagram.jpg" width="400" height="300" /></svg>`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://a.com/diagram.jpg",
    ]);
  });

  test("extracts SVG image xlink:href", () => {
    const html = `<svg><image xlink:href="https://a.com/diagram.jpg" width="400" height="300" /></svg>`;
    expect(extractExternalImageUrls(html)).toEqual([
      "https://a.com/diagram.jpg",
    ]);
  });

  test("skips SVG image with non-external href", () => {
    const html = `<svg><image href="data:image/png;base64,abc" /></svg>`;
    expect(extractExternalImageUrls(html)).toEqual([]);
  });

  test("deduplicates across img and SVG image", () => {
    const html = `
      <img src="https://a.com/photo.jpg" />
      <svg><image href="https://a.com/photo.jpg" /></svg>`;
    expect(extractExternalImageUrls(html)).toEqual(["https://a.com/photo.jpg"]);
  });
});

describe("pickLargestSrcsetUrl", () => {
  test("picks largest width descriptor", () => {
    expect(
      pickLargestSrcsetUrl(
        "https://a.com/sm.jpg 300w, https://a.com/md.jpg 600w, https://a.com/lg.jpg 1200w",
      ),
    ).toBe("https://a.com/lg.jpg");
  });

  test("picks largest pixel density descriptor", () => {
    expect(
      pickLargestSrcsetUrl("https://a.com/1x.jpg 1x, https://a.com/2x.jpg 2x"),
    ).toBe("https://a.com/2x.jpg");
  });

  test("handles single candidate", () => {
    expect(pickLargestSrcsetUrl("https://a.com/only.jpg 400w")).toBe(
      "https://a.com/only.jpg",
    );
  });

  test("handles bare URL without descriptor", () => {
    expect(pickLargestSrcsetUrl("https://a.com/bare.jpg")).toBe(
      "https://a.com/bare.jpg",
    );
  });

  test("skips non-external URLs", () => {
    expect(
      pickLargestSrcsetUrl("/local/img.jpg 300w, https://a.com/ext.jpg 600w"),
    ).toBe("https://a.com/ext.jpg");
  });

  test("returns null for empty srcset", () => {
    expect(pickLargestSrcsetUrl("")).toBeNull();
  });

  test("returns null when all URLs are non-external", () => {
    expect(
      pickLargestSrcsetUrl("/a.jpg 300w, data:image/gif;base64,R0l 600w"),
    ).toBeNull();
  });
});

describe("detectImageType", () => {
  test("detects JPEG", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageType(buf)).toBe("image/jpeg");
  });

  test("detects PNG", () => {
    const buf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    expect(detectImageType(buf)).toBe("image/png");
  });

  test("detects GIF87a", () => {
    const buf = Buffer.from("GIF87a...", "ascii");
    expect(detectImageType(buf)).toBe("image/gif");
  });

  test("detects GIF89a", () => {
    const buf = Buffer.from("GIF89a...", "ascii");
    expect(detectImageType(buf)).toBe("image/gif");
  });

  test("detects WebP", () => {
    const buf = Buffer.alloc(16);
    buf.write("RIFF", 0, "ascii");
    buf.writeUInt32LE(1000, 4); // file size
    buf.write("WEBP", 8, "ascii");
    expect(detectImageType(buf)).toBe("image/webp");
  });

  test("rejects RIFF without WEBP brand", () => {
    const buf = Buffer.alloc(16);
    buf.write("RIFF", 0, "ascii");
    buf.writeUInt32LE(1000, 4);
    buf.write("AVI ", 8, "ascii");
    expect(detectImageType(buf)).toBeNull();
  });

  test("detects SVG", () => {
    const buf = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'>");
    expect(detectImageType(buf)).toBe("image/svg+xml");
  });

  test("detects AVIF", () => {
    const buf = Buffer.alloc(16);
    buf.writeUInt32BE(32, 0); // box size
    buf.write("ftyp", 4, "ascii");
    buf.write("avif", 8, "ascii");
    expect(detectImageType(buf)).toBe("image/avif");
  });

  test("detects AVIF with avis brand", () => {
    const buf = Buffer.alloc(16);
    buf.writeUInt32BE(32, 0);
    buf.write("ftyp", 4, "ascii");
    buf.write("avis", 8, "ascii");
    expect(detectImageType(buf)).toBe("image/avif");
  });

  test("returns null for unknown data", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(detectImageType(buf)).toBeNull();
  });

  test("returns null for empty buffer", () => {
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("rewriteImageUrls", () => {
  test("rewrites matching URLs to asset paths", () => {
    const html = `<div><img src="https://example.com/photo.jpg" /></div>`;
    const map = new Map([["https://example.com/photo.jpg", "asset-1"]]);

    const result = rewriteImageUrls(html, map);
    expect(result).toContain('src="/api/assets/asset-1"');
    expect(result).not.toContain("example.com");
  });

  test("leaves non-matching URLs unchanged", () => {
    const html = `<img src="https://other.com/img.jpg" />`;
    const map = new Map([["https://example.com/photo.jpg", "asset-1"]]);

    const result = rewriteImageUrls(html, map);
    expect(result).toContain("https://other.com/img.jpg");
  });

  test("rewrites multiple URLs", () => {
    const html = `
      <img src="https://a.com/1.jpg" />
      <img src="https://b.com/2.png" />`;
    const map = new Map([
      ["https://a.com/1.jpg", "asset-a"],
      ["https://b.com/2.png", "asset-b"],
    ]);

    const result = rewriteImageUrls(html, map);
    expect(result).toContain("/api/assets/asset-a");
    expect(result).toContain("/api/assets/asset-b");
  });

  test("handles empty map (no rewrites)", () => {
    const html = `<img src="https://example.com/photo.jpg" />`;
    const result = rewriteImageUrls(html, new Map());
    expect(result).toContain("https://example.com/photo.jpg");
  });

  test("strips srcset from img elements", () => {
    const html = `<img src="https://example.com/photo.jpg" srcset="https://example.com/photo-2x.jpg 2x" />`;
    const map = new Map([["https://example.com/photo.jpg", "asset-1"]]);
    const result = rewriteImageUrls(html, map);
    expect(result).toContain('src="/api/assets/asset-1"');
    expect(result).not.toContain("srcset");
  });

  test("strips srcset even when src is not cached", () => {
    const html = `<img src="https://example.com/photo.jpg" srcset="https://example.com/photo-2x.jpg 2x" />`;
    const result = rewriteImageUrls(html, new Map());
    expect(result).not.toContain("srcset");
  });

  test("rewrites data-src and removes the attribute", () => {
    const html = `<img data-src="https://example.com/lazy.jpg" src="data:image/gif;base64,placeholder" />`;
    const map = new Map([["https://example.com/lazy.jpg", "asset-1"]]);
    const result = rewriteImageUrls(html, map);
    expect(result).toContain('src="/api/assets/asset-1"');
    expect(result).not.toContain("data-src");
  });

  test("removes source elements inside picture", () => {
    const html = `
      <picture>
        <source srcset="https://example.com/photo.webp" type="image/webp" />
        <img src="https://example.com/photo.jpg" />
      </picture>`;
    const map = new Map([["https://example.com/photo.jpg", "asset-1"]]);
    const result = rewriteImageUrls(html, map);
    expect(result).not.toContain("<source");
    expect(result).toContain('src="/api/assets/asset-1"');
  });

  test("cleans up all lazy-loading attributes", () => {
    const html = `<img data-src="https://a.com/1.jpg" data-lazy-src="https://a.com/2.jpg" data-original="https://a.com/3.jpg" data-actualsrc="https://a.com/4.jpg" data-srv="https://a.com/5.jpg" data-lazy="https://a.com/6.jpg" data-lazyload="https://a.com/7.jpg" data-img-src="https://a.com/8.jpg" data-url="https://a.com/9.jpg" data-hi-res-src="https://a.com/10.jpg" data-highres="https://a.com/11.jpg" data-full-src="https://a.com/12.jpg" src="https://a.com/1.jpg" />`;
    const map = new Map([["https://a.com/1.jpg", "asset-1"]]);
    const result = rewriteImageUrls(html, map);
    expect(result).not.toContain("data-src");
    expect(result).not.toContain("data-lazy-src");
    expect(result).not.toContain("data-original");
    expect(result).not.toContain("data-actualsrc");
    expect(result).not.toContain("data-srv");
    expect(result).not.toContain("data-lazy");
    expect(result).not.toContain("data-lazyload");
    expect(result).not.toContain("data-img-src");
    expect(result).not.toContain("data-url");
    expect(result).not.toContain("data-hi-res-src");
    expect(result).not.toContain("data-highres");
    expect(result).not.toContain("data-full-src");
  });

  test("rewrites from srcset when no src or data-* attrs", () => {
    const html = `<img srcset="https://a.com/sm.jpg 300w, https://a.com/lg.jpg 800w" />`;
    const map = new Map([["https://a.com/lg.jpg", "asset-lg"]]);
    const result = rewriteImageUrls(html, map);
    expect(result).toContain('src="/api/assets/asset-lg"');
    expect(result).not.toContain("srcset");
  });

  test("rewrites from data-srcset", () => {
    const html = `<img data-srcset="https://a.com/img.jpg 1x, https://a.com/img2x.jpg 2x" />`;
    const map = new Map([["https://a.com/img2x.jpg", "asset-2x"]]);
    const result = rewriteImageUrls(html, map);
    expect(result).toContain('src="/api/assets/asset-2x"');
    expect(result).not.toContain("data-srcset");
  });

  test("strips data-srcset and data-lazy-srcset even when not cached", () => {
    const html = `<img src="https://a.com/photo.jpg" data-srcset="https://a.com/lg.jpg 800w" data-lazy-srcset="https://a.com/xl.jpg 1200w" />`;
    const map = new Map([["https://a.com/photo.jpg", "asset-1"]]);
    const result = rewriteImageUrls(html, map);
    expect(result).toContain('src="/api/assets/asset-1"');
    expect(result).not.toContain("data-srcset");
    expect(result).not.toContain("data-lazy-srcset");
  });

  test("rewrites SVG image href", () => {
    const html = `<svg><image href="https://a.com/diagram.jpg" width="400" height="300" /></svg>`;
    const map = new Map([["https://a.com/diagram.jpg", "asset-svg"]]);
    const result = rewriteImageUrls(html, map);
    expect(result).toContain('href="/api/assets/asset-svg"');
    expect(result).not.toContain("https://a.com/diagram.jpg");
  });

  test("leaves SVG image unchanged when not in cache map", () => {
    const html = `<svg><image href="https://a.com/diagram.jpg" width="400" /></svg>`;
    const result = rewriteImageUrls(html, new Map());
    expect(result).toContain("https://a.com/diagram.jpg");
  });
});

describe("resolveHtmlContent", () => {
  let mockDb: MockDb;
  let mockAssetDb: { readAsset: MockFn };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb = (await import("@karakeep/db")).db as unknown as MockDb;
    mockAssetDb =
      (await import("@karakeep/shared/assetdb")) as unknown as typeof mockAssetDb;
  });

  test("returns null when no bookmarkLink exists", async () => {
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue(undefined);

    const result = await resolveHtmlContent("bm-1", "user-1");
    expect(result).toBeNull();
  });

  test("returns inline HTML when htmlContent is present", async () => {
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      url: "https://example.com/page",
      htmlContent: "<p>Hello</p>",
      contentAssetId: null,
    });

    const result = await resolveHtmlContent("bm-1", "user-1");
    expect(result).toEqual({
      htmlContent: "<p>Hello</p>",
      source: "inline",
      contentAssetId: null,
      url: "https://example.com/page",
    });
  });

  test("returns asset-based HTML when contentAssetId is present", async () => {
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      url: "https://example.com/page",
      htmlContent: null,
      contentAssetId: "asset-123",
    });
    mockAssetDb.readAsset.mockResolvedValue({
      asset: Buffer.from("<p>From asset</p>", "utf8"),
      metadata: { contentType: "text/html", fileName: null },
    });

    const result = await resolveHtmlContent("bm-1", "user-1");
    expect(result).toEqual({
      htmlContent: "<p>From asset</p>",
      source: "asset",
      contentAssetId: "asset-123",
      url: "https://example.com/page",
    });
    expect(mockAssetDb.readAsset).toHaveBeenCalledWith({
      userId: "user-1",
      assetId: "asset-123",
    });
  });

  test("prefers contentAssetId over htmlContent when both present", async () => {
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      url: "https://example.com/page",
      htmlContent: "<p>Inline</p>",
      contentAssetId: "asset-456",
    });
    mockAssetDb.readAsset.mockResolvedValue({
      asset: Buffer.from("<p>Asset wins</p>", "utf8"),
      metadata: { contentType: "text/html", fileName: null },
    });

    const result = await resolveHtmlContent("bm-1", "user-1");
    expect(result!.source).toBe("asset");
    expect(result!.htmlContent).toBe("<p>Asset wins</p>");
  });

  test("returns null when link has neither htmlContent nor contentAssetId", async () => {
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      url: "https://example.com/page",
      htmlContent: null,
      contentAssetId: null,
    });

    const result = await resolveHtmlContent("bm-1", "user-1");
    expect(result).toBeNull();
  });

  test("falls back to inline HTML when asset read fails (orphaned reference)", async () => {
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      url: "https://example.com/page",
      htmlContent: "<p>Fallback</p>",
      contentAssetId: "missing-asset",
    });
    mockAssetDb.readAsset.mockRejectedValue(
      new Error("ENOENT: file not found"),
    );

    const result = await resolveHtmlContent("bm-1", "user-1");
    expect(result).toEqual({
      htmlContent: "<p>Fallback</p>",
      source: "inline",
      contentAssetId: null,
      url: "https://example.com/page",
    });
  });

  test("returns null when asset read fails and no inline HTML exists", async () => {
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      url: "https://example.com/page",
      htmlContent: null,
      contentAssetId: "missing-asset",
    });
    mockAssetDb.readAsset.mockRejectedValue(
      new Error("ENOENT: file not found"),
    );

    const result = await resolveHtmlContent("bm-1", "user-1");
    expect(result).toBeNull();
  });
});

describe("downloadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("downloads valid image successfully", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    const imageBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(imageBuffer, "image/png"),
    );

    const result = await downloadImage(
      "https://example.com/img.png",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
    );

    expect(result).not.toBeNull();
    expect(result!.src).toBe("https://example.com/img.png");
    expect(result!.contentType).toBe("image/png");
    expect(result!.buffer).toBeInstanceOf(Buffer);
    expect(result!.assetId).toBe("test-asset-id");
  });

  test("returns null for invalid URL", async () => {
    mockValidateUrl.mockResolvedValue({ ok: false });

    const result = await downloadImage(
      "https://evil.com/img.png",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
    );
    expect(result).toBeNull();
    expect(mockFetchWithProxy).not.toHaveBeenCalled();
  });

  test("returns null for non-OK response", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(0), "image/png", 404),
    );

    const result = await downloadImage(
      "https://example.com/gone.png",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
    );
    expect(result).toBeNull();
  });

  test("returns null for unsupported content type", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(10), "application/pdf"),
    );

    const result = await downloadImage(
      "https://example.com/doc.pdf",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
    );
    expect(result).toBeNull();
  });

  test.each(["image/svg+xml", "image/avif", "image/apng"])(
    "accepts %s content type",
    async (contentType) => {
      mockValidateUrl.mockResolvedValue({ ok: true });
      mockFetchWithProxy.mockResolvedValue(
        mockResponse(new ArrayBuffer(100), contentType),
      );

      const result = await downloadImage(
        "https://example.com/image",
        "test-asset-id",
        "job-1",
        10 * 1024 * 1024,
      );
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe(contentType);
    },
  );

  test("falls back to magic bytes when Content-Type is wrong", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    // JPEG magic bytes but server says text/html
    const jpegBuffer = new ArrayBuffer(10);
    const view = new Uint8Array(jpegBuffer);
    view[0] = 0xff;
    view[1] = 0xd8;
    view[2] = 0xff;
    mockFetchWithProxy.mockResolvedValue(mockResponse(jpegBuffer, "text/html"));

    const result = await downloadImage(
      "https://example.com/image.jpg",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
    );
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("image/jpeg");
  });

  test("returns null when Content-Type is wrong and magic bytes don't match", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(10), "text/html"),
    );

    const result = await downloadImage(
      "https://example.com/page",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
    );
    expect(result).toBeNull();
  });

  test("returns null when content-length exceeds max size", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(0), "image/jpeg", 200, "999999999"),
    );

    const result = await downloadImage(
      "https://example.com/huge.jpg",
      "test-asset-id",
      "job-1",
      1024,
    );
    expect(result).toBeNull();
  });

  test("returns null when downloaded buffer exceeds max size", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    const bigBuffer = new ArrayBuffer(2048);
    mockFetchWithProxy.mockResolvedValue(mockResponse(bigBuffer, "image/jpeg"));

    const result = await downloadImage(
      "https://example.com/big.jpg",
      "test-asset-id",
      "job-1",
      1024,
    );
    expect(result).toBeNull();
  });

  test("returns null on network error after retries", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockRejectedValue(new Error("ECONNRESET"));

    const result = await downloadImage(
      "https://example.com/fail.jpg",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
      { maxRetries: 2 },
    );
    expect(result).toBeNull();
    // 1 initial attempt + 2 retries = 3 total fetch calls
    expect(mockFetchWithProxy).toHaveBeenCalledTimes(3);
  });

  test("retries on 429 and succeeds", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    const imageBuffer = new ArrayBuffer(4);
    mockFetchWithProxy
      .mockResolvedValueOnce(mockResponse(new ArrayBuffer(0), "", 429))
      .mockResolvedValueOnce(mockResponse(imageBuffer, "image/png"));

    const result = await downloadImage(
      "https://example.com/rate-limited.png",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
      { maxRetries: 3 },
    );
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("image/png");
    expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
  });

  test("does not retry on non-retryable status like 404", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(0), "", 404),
    );

    const result = await downloadImage(
      "https://example.com/missing.jpg",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
    );
    expect(result).toBeNull();
    expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
  });

  test("strips content-type parameters (charset, boundary)", async () => {
    mockValidateUrl.mockResolvedValue({ ok: true });
    const imageBuffer = new ArrayBuffer(4);
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(imageBuffer, "image/jpeg; charset=utf-8"),
    );

    const result = await downloadImage(
      "https://example.com/img.jpg",
      "test-asset-id",
      "job-1",
      10 * 1024 * 1024,
    );
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("image/jpeg");
  });
});

describe("run", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb = (await import("@karakeep/db")).db as unknown as MockDb;
    mockAssetDb =
      (await import("@karakeep/shared/assetdb")) as unknown as typeof mockAssetDb;
    mockConfig = (await import("@karakeep/shared/config"))
      .default as unknown as typeof mockConfig;
    const sharedServer = await import("@karakeep/shared-server");
    mockQuotaService =
      sharedServer.QuotaService as unknown as typeof mockQuotaService;

    // Default: feature enabled
    mockConfig.crawler.storeContentImages = true;
    mockConfig.crawler.contentImageMaxCount = 50;
    mockConfig.crawler.contentImageMaxSizeMb = 5;
  });

  test("skips when feature is disabled", async () => {
    mockConfig.crawler.storeContentImages = false;

    await run(makeJob("bookmark-1"));

    // Should not query the DB at all
    expect(mockDb.query.bookmarks.findFirst).not.toHaveBeenCalled();
  });

  test("throws when bookmark is not found", async () => {
    mockDb.query.bookmarks.findFirst.mockResolvedValue(undefined);

    await expect(run(makeJob("nonexistent"))).rejects.toThrow(
      /Bookmark "nonexistent" not found/,
    );
  });

  test("returns early when no HTML content exists", async () => {
    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue(undefined);

    await run(makeJob("bm-1"));

    // Should not attempt any downloads
    expect(mockValidateUrl).not.toHaveBeenCalled();
  });

  test("returns early when HTML has no external images", async () => {
    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent: "<p>No images at all</p>",
      contentAssetId: null,
    });

    await run(makeJob("bm-1"));

    expect(mockValidateUrl).not.toHaveBeenCalled();
  });

  test("processes inline HTML content end-to-end", async () => {
    const htmlContent =
      '<div><img src="https://example.com/photo.jpg" /></div>';
    const imageBuffer = new ArrayBuffer(100);
    const mockOnConflict = vi.fn();
    const mockValues = vi
      .fn()
      .mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    const mockWhere = vi.fn();

    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent,
      contentAssetId: null,
    });
    (
      mockDb.query as unknown as MockDb["query"]
    ).assets.findMany.mockResolvedValue([]);

    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(imageBuffer, "image/jpeg"),
    );

    mockQuotaService.checkStorageQuota.mockResolvedValue({
      quotaApproved: true,
    });
    mockAssetDb.saveAsset.mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({ values: mockValues });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: mockWhere }),
    });

    await run(makeJob("bm-1"));

    // Verify image was saved as asset
    expect(mockAssetDb.saveAsset).toHaveBeenCalled();
    // Verify asset DB record was upserted
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockOnConflict).toHaveBeenCalled();
    // Verify HTML was updated (inline path uses db.update on bookmarkLinks)
    expect(mockDb.update).toHaveBeenCalled();
  });

  test("skips already-downloaded images", async () => {
    const htmlContent = '<img src="https://example.com/cached.jpg" />';
    const expectedAssetId = contentImageAssetId(
      "bm-1",
      "https://example.com/cached.jpg",
    );

    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent,
      contentAssetId: null,
    });
    // Simulate the image already being cached
    (
      mockDb.query as unknown as MockDb["query"]
    ).assets.findMany.mockResolvedValue([{ id: expectedAssetId }]);

    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn() }),
    });

    await run(makeJob("bm-1"));

    // Should not attempt to download since it's already cached
    expect(mockValidateUrl).not.toHaveBeenCalled();
    expect(mockFetchWithProxy).not.toHaveBeenCalled();
    // Should still rewrite HTML with the cached asset URL
    expect(mockDb.update).toHaveBeenCalled();
  });

  test("stops saving when storage quota is exceeded", async () => {
    const { StorageQuotaError } = await import("@karakeep/shared-server");
    const htmlContent = `
      <img src="https://a.com/1.jpg" />
      <img src="https://b.com/2.jpg" />`;

    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent,
      contentAssetId: null,
    });
    (
      mockDb.query as unknown as MockDb["query"]
    ).assets.findMany.mockResolvedValue([]);

    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(50), "image/jpeg"),
    );

    // First image: checkStorageQuota throws when quota is exceeded
    mockQuotaService.checkStorageQuota.mockRejectedValueOnce(
      new StorageQuotaError(500, 1000, 100),
    );

    await run(makeJob("bm-1"));

    // checkStorageQuota throws before saveAsset is called, so saveAsset is never reached
    // for the first image, and the second image is skipped due to quotaExceeded flag
    expect(mockAssetDb.saveAsset).not.toHaveBeenCalled();
  });

  test("respects contentImageMaxCount limit", async () => {
    mockConfig.crawler.contentImageMaxCount = 2;

    const htmlContent = `
      <img src="https://a.com/1.jpg" />
      <img src="https://b.com/2.jpg" />
      <img src="https://c.com/3.jpg" />`;

    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent,
      contentAssetId: null,
    });
    (
      mockDb.query as unknown as MockDb["query"]
    ).assets.findMany.mockResolvedValue([]);

    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(50), "image/jpeg"),
    );
    mockQuotaService.checkStorageQuota.mockResolvedValue({
      quotaApproved: true,
    });
    mockAssetDb.saveAsset.mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn() }),
    });

    await run(makeJob("bm-1"));

    // Only 2 images should be downloaded (maxCount = 2), not 3
    expect(mockValidateUrl).toHaveBeenCalledTimes(2);
  });

  test("continues processing remaining images when saveAsset throws a non-quota error", async () => {
    const htmlContent = `
      <img src="https://a.com/1.jpg" />
      <img src="https://b.com/2.jpg" />`;

    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent,
      contentAssetId: null,
    });
    (
      mockDb.query as unknown as MockDb["query"]
    ).assets.findMany.mockResolvedValue([]);

    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(50), "image/jpeg"),
    );
    mockQuotaService.checkStorageQuota.mockResolvedValue({
      quotaApproved: true,
    });

    // First saveAsset fails with a generic error, second succeeds
    mockAssetDb.saveAsset
      .mockRejectedValueOnce(new Error("disk I/O error"))
      .mockResolvedValueOnce(undefined);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn() }),
    });

    await run(makeJob("bm-1"));

    // saveAsset called for both images (not short-circuited like quota errors)
    expect(mockAssetDb.saveAsset).toHaveBeenCalledTimes(2);
    // DB insert only for the second (successful) image
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  test("caches images but tolerates quota error when saving rewritten HTML (asset path)", async () => {
    const { StorageQuotaError } = await import("@karakeep/shared-server");
    const htmlContent = '<img src="https://example.com/photo.jpg" />';

    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent: null,
      contentAssetId: "content-asset-1",
    });
    (
      mockDb.query as unknown as MockDb["query"]
    ).assets.findMany.mockResolvedValue([]);

    // readAsset returns the HTML content from asset storage
    mockAssetDb.readAsset.mockResolvedValue({
      asset: Buffer.from(htmlContent, "utf8"),
      metadata: { contentType: "text/html", fileName: null },
    });

    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(50), "image/jpeg"),
    );

    // Image save quota check passes, but the HTML rewrite quota check fails
    mockQuotaService.checkStorageQuota
      .mockResolvedValueOnce({ quotaApproved: true }) // image save
      .mockRejectedValueOnce(new StorageQuotaError(900, 1000, 200)); // HTML rewrite
    mockAssetDb.saveAsset.mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn() }),
    });

    // Should NOT throw — quota error during HTML save is tolerated
    await run(makeJob("bm-1"));

    // Image was saved successfully (saveAsset called once for the image only,
    // not for the HTML rewrite since quota check threw before reaching saveAsset)
    expect(mockAssetDb.saveAsset).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  test("processes asset-based HTML content", async () => {
    const htmlContent = '<img src="https://example.com/photo.jpg" />';
    const mockSetWhere = vi.fn();

    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent: null,
      contentAssetId: "content-asset-1",
    });
    (
      mockDb.query as unknown as MockDb["query"]
    ).assets.findMany.mockResolvedValue([]);

    // readAsset returns the HTML content from asset storage
    mockAssetDb.readAsset.mockResolvedValue({
      asset: Buffer.from(htmlContent, "utf8"),
      metadata: { contentType: "text/html", fileName: null },
    });

    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(50), "image/png"),
    );
    mockQuotaService.checkStorageQuota.mockResolvedValue({
      quotaApproved: true,
    });
    mockAssetDb.saveAsset.mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: mockSetWhere }),
    });

    await run(makeJob("bm-1"));

    // Should save the rewritten HTML back via saveAsset (asset path)
    // saveAsset called twice: once for the image, once for the rewritten HTML
    expect(mockAssetDb.saveAsset).toHaveBeenCalledTimes(2);
  });

  test("deletes stale content images after successful re-crawl", async () => {
    // HTML now only has image B; image A was in a previous crawl and is stale
    const htmlContent = '<img src="https://example.com/b.jpg" />';
    const staleAssetId = "stale-asset-from-previous-crawl";

    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent,
      contentAssetId: null,
    });

    // First findMany call: check existing assets (none cached yet for image B)
    // Second findMany call: query stale assets (returns the old image A)
    (mockDb.query as unknown as MockDb["query"]).assets.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: staleAssetId }]);

    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(50), "image/jpeg"),
    );
    mockQuotaService.checkStorageQuota.mockResolvedValue({
      quotaApproved: true,
    });
    mockAssetDb.saveAsset.mockResolvedValue(undefined);
    mockAssetDb.deleteAsset.mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn() }),
    });
    mockDb.delete.mockReturnValue({ where: vi.fn() });

    await run(makeJob("bm-1"));

    // Verify stale asset was deleted from storage and DB
    expect(mockAssetDb.deleteAsset).toHaveBeenCalledWith({
      userId: "user-1",
      assetId: staleAssetId,
    });
    expect(mockDb.delete).toHaveBeenCalled();
  });

  test("tolerates errors when deleting stale assets", async () => {
    const htmlContent = '<img src="https://example.com/new.jpg" />';

    mockDb.query.bookmarks.findFirst.mockResolvedValue({
      id: "bm-1",
      userId: "user-1",
    });
    mockDb.query.bookmarkLinks.findFirst.mockResolvedValue({
      htmlContent,
      contentAssetId: null,
    });

    // First findMany: no existing assets; Second: one stale asset
    (mockDb.query as unknown as MockDb["query"]).assets.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "stale-1" }]);

    mockValidateUrl.mockResolvedValue({ ok: true });
    mockFetchWithProxy.mockResolvedValue(
      mockResponse(new ArrayBuffer(50), "image/jpeg"),
    );
    mockQuotaService.checkStorageQuota.mockResolvedValue({
      quotaApproved: true,
    });
    mockAssetDb.saveAsset.mockResolvedValue(undefined);
    // deleteAsset throws — should be caught and not fail the job
    mockAssetDb.deleteAsset.mockRejectedValue(new Error("disk error"));
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn() }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn() }),
    });
    mockDb.delete.mockReturnValue({ where: vi.fn() });

    // Should not throw despite deleteAsset failing
    await expect(run(makeJob("bm-1"))).resolves.toBeUndefined();
  });
});
