import { Readable } from "stream";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fetchWithProxy = vi.hoisted(() => vi.fn());
const saveAssetFromFile = vi.hoisted(() => vi.fn());

vi.mock("network", () => ({
  fetchWithProxy,
  getBookmarkDomain: () => "example.com",
}));

vi.mock("@karakeep/db", () => ({
  db: {},
}));

vi.mock("@karakeep/shared-server", () => ({
  getTracer: () => ({}),
  withSpan: async <T>(
    _tracer: unknown,
    _name: string,
    _options: unknown,
    fn: () => Promise<T>,
  ) => fn(),
  QuotaService: {
    checkStorageQuota: vi.fn(async () => ({ approved: true })),
  },
}));

vi.mock("@karakeep/shared/assetdb", () => ({
  ASSET_TYPES: { TEXT_HTML: "text/html" },
  IMAGE_ASSET_TYPES: new Set(["image/png"]),
  newAssetId: () => "asset-id",
  saveAsset: vi.fn(),
  saveAssetFromFile,
  getAssetSize: vi.fn(),
}));

vi.mock("@karakeep/shared/config", () => ({
  default: {
    maxAssetSizeMb: 4,
    crawler: {
      downloadBannerImage: true,
      bannerDownloadTimeoutSec: 0.05,
    },
  },
}));

vi.mock("@karakeep/shared/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { downloadAndStoreFile, downloadAndStoreImage } from "./assetStorage";

const runProxy = {
  httpProxy: undefined,
  httpsProxy: undefined,
  noProxy: undefined,
};

// Simulates a host that accepts the connection and never answers: the promise
// only settles once the signal handed to fetch aborts.
function hangUntilAborted() {
  fetchWithProxy.mockImplementation(
    (_url: string, options: { signal: AbortSignal }) =>
      new Promise((_, reject) => {
        const { signal } = options;
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
}

function respondWithImage(bytes: Buffer) {
  fetchWithProxy.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "image/png" }),
    body: Readable.from([bytes]),
  });
}

describe("downloadAndStoreFile", () => {
  beforeEach(() => {
    fetchWithProxy.mockReset();
    saveAssetFromFile.mockReset();
  });

  test("returns null when the download exceeds its own timeout", async () => {
    hangUntilAborted();
    const job = new AbortController();

    const result = await downloadAndStoreFile(
      "https://example.com/banner.png",
      "user-id",
      "job-id",
      "image",
      job.signal,
      runProxy,
      0.05,
    );

    expect(result).toBeNull();
    expect(job.signal.aborted).toBe(false);
    expect(saveAssetFromFile).not.toHaveBeenCalled();
  }, 2000);

  test("re-throws when the job-wide signal aborts during the download", async () => {
    hangUntilAborted();
    const job = new AbortController();
    const reason = new Error("Timed-out after 60 secs");
    setTimeout(() => job.abort(reason), 10);

    await expect(
      downloadAndStoreFile(
        "https://example.com/banner.png",
        "user-id",
        "job-id",
        "image",
        job.signal,
        runProxy,
        5,
      ),
    ).rejects.toBe(reason);
  }, 2000);

  test("passes the job-wide signal through untouched when no timeout is given", async () => {
    respondWithImage(Buffer.from("png"));
    const job = new AbortController();

    const result = await downloadAndStoreFile(
      "https://example.com/file.png",
      "user-id",
      "job-id",
      "image",
      job.signal,
      runProxy,
    );

    expect(fetchWithProxy).toHaveBeenCalledTimes(1);
    expect(fetchWithProxy.mock.calls[0][1].signal).toBe(job.signal);
    expect(result).toEqual({
      assetId: "asset-id",
      userId: "user-id",
      contentType: "image/png",
      size: 3,
    });
  });

  test.each([0, -1])(
    "treats a timeout of %s as disabled and passes the job-wide signal through",
    async (timeoutSec) => {
      respondWithImage(Buffer.from("png"));
      const job = new AbortController();

      const result = await downloadAndStoreFile(
        "https://example.com/banner.png",
        "user-id",
        "job-id",
        "image",
        job.signal,
        runProxy,
        timeoutSec,
      );

      expect(fetchWithProxy).toHaveBeenCalledTimes(1);
      expect(fetchWithProxy.mock.calls[0][1].signal).toBe(job.signal);
      expect(result).toEqual({
        assetId: "asset-id",
        userId: "user-id",
        contentType: "image/png",
        size: 3,
      });
    },
  );

  test("stores the file when it completes within the timeout", async () => {
    respondWithImage(Buffer.from("png-bytes"));
    const job = new AbortController();

    const result = await downloadAndStoreFile(
      "https://example.com/banner.png",
      "user-id",
      "job-id",
      "image",
      job.signal,
      runProxy,
      5,
    );

    expect(result).toEqual({
      assetId: "asset-id",
      userId: "user-id",
      contentType: "image/png",
      size: 9,
    });
    expect(saveAssetFromFile).toHaveBeenCalledTimes(1);
  });
});

describe("downloadAndStoreImage", () => {
  beforeEach(() => {
    fetchWithProxy.mockReset();
    saveAssetFromFile.mockReset();
  });

  test("skips the banner instead of failing the crawl when the host hangs", async () => {
    hangUntilAborted();
    const job = new AbortController();

    const result = await downloadAndStoreImage(
      "https://example.com/banner.png",
      "user-id",
      "job-id",
      job.signal,
      runProxy,
    );

    expect(result).toBeNull();
    expect(job.signal.aborted).toBe(false);
  }, 2000);

  test("still surfaces a job-wide abort", async () => {
    hangUntilAborted();
    const job = new AbortController();
    const reason = new Error("Timed-out after 60 secs");
    job.abort(reason);

    await expect(
      downloadAndStoreImage(
        "https://example.com/banner.png",
        "user-id",
        "job-id",
        job.signal,
        runProxy,
      ),
    ).rejects.toBe(reason);
  }, 2000);
});
