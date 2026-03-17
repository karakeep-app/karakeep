import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  contentImageAssetId,
  downloadImage,
  extractExternalImageUrls,
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
let mockAssetDb: { saveAsset: MockFn; readAsset: MockFn };
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
    );
    expect(result).toBeNull();
    // 1 initial attempt + 3 retries = 4 total fetch calls
    expect(mockFetchWithProxy).toHaveBeenCalledTimes(4);
  }, 15_000);

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
    );
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("image/png");
    expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
  }, 10_000);

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
});
