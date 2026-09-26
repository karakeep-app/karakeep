import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAssetSize,
  QuotaService,
  saveAssetFromFile,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { QuotaApproved } from "@karakeep/shared/storageQuota";

import { archiveWebpage } from "./assetStorage";

vi.mock("@karakeep/db", () => ({ db: {} }));
vi.mock("network", () => ({
  fetchWithProxy: vi.fn(),
  getBookmarkDomain: (url: string) => new URL(url).hostname,
}));
vi.mock("@karakeep/shared/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@karakeep/shared/config", () => ({
  default: {
    crawler: {
      monolithTimeoutSec: 30,
      monolithArguments: [],
      fullPageArchiveMaxSizeMb: 0,
    },
  },
}));
vi.mock("@karakeep/shared-server", () => ({
  getTracer: vi.fn(),
  withSpan: (
    _tracer: unknown,
    _name: string,
    _options: unknown,
    fn: () => unknown,
  ) => fn(),
  newAssetId: () => randomUUID(),
  QuotaService: { checkStorageQuota: vi.fn() },
  saveAssetFromFile: vi.fn(),
  getAssetSize: vi.fn(),
}));

// Exercise real execa exit/cancellation behavior without requiring Monolith or
// network access. Like Monolith, this child writes a cache in its temp directory.
const monolithFixture = `#!${process.execPath}
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const args = process.argv.slice(2);
const output = args[args.indexOf("-o") + 1];
fs.writeFileSync(path.join(os.tmpdir(), "monolith-" + path.basename(output)), "cached media");
fs.writeFileSync(output, "<html>archived page</html>");
fs.writeFileSync(path.join(process.env.ARCHIVE_TEST_READY, path.basename(output)), output);
if (process.env.ARCHIVE_TEST_MODE === "fail") process.exit(1);
if (process.env.ARCHIVE_TEST_MODE === "wait") setInterval(() => {}, 1000);
`;

let scratch: string;
let tempDir: string;
let readyDir: string;
let assetsDir: string;

function archive(signal = new AbortController().signal) {
  return archiveWebpage(
    "<html>page</html>",
    "https://example.com",
    "user",
    "job",
    signal,
    { httpProxy: undefined, httpsProxy: undefined, noProxy: undefined },
  );
}

beforeEach(async () => {
  vi.resetAllMocks();
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), "archive-test-"));
  tempDir = path.join(scratch, "tmp");
  readyDir = path.join(scratch, "ready");
  const binDir = path.join(scratch, "bin");
  await Promise.all([tempDir, readyDir, binDir].map((dir) => fs.mkdir(dir)));
  await fs.writeFile(path.join(binDir, "monolith"), monolithFixture, {
    mode: 0o755,
  });
  vi.stubEnv("TMPDIR", tempDir);
  vi.stubEnv("PATH", `${binDir}${path.delimiter}${process.env.PATH}`);
  vi.stubEnv("ARCHIVE_TEST_READY", readyDir);
  vi.stubEnv("ARCHIVE_TEST_MODE", "success");
  serverConfig.crawler.fullPageArchiveMaxSizeMb = 0;
  assetsDir = path.join(scratch, "assets");
  await fs.mkdir(assetsDir);
  vi.mocked(QuotaService.checkStorageQuota).mockResolvedValue(
    QuotaApproved._create("user", 1024),
  );
  vi.mocked(saveAssetFromFile).mockImplementation(
    async ({ assetPath, assetId }) => {
      await fs.copyFile(assetPath, path.join(assetsDir, assetId));
      await fs.rm(assetPath);
    },
  );
  vi.mocked(getAssetSize).mockImplementation(
    async ({ assetId }) => (await fs.stat(path.join(assetsDir, assetId))).size,
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(scratch, { recursive: true, force: true });
});

describe("archiveWebpage temporary files", () => {
  it("removes the cache after saving without deleting the stored archive", async () => {
    const result = await archive();
    expect(result).toMatchObject({ contentType: "text/html", size: 26 });
    const saved = await fs.readFile(
      path.join(assetsDir, result!.assetId),
      "utf8",
    );
    expect(saved).toBe("<html>archived page</html>");
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it("cleans up and propagates nonzero subprocess exits", async () => {
    vi.stubEnv("ARCHIVE_TEST_MODE", "fail");
    await expect(archive()).rejects.toMatchObject({ exitCode: 1 });
    expect(saveAssetFromFile).not.toHaveBeenCalled();
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it("cleans up when canceled after the child writes temporary files", async () => {
    vi.stubEnv("ARCHIVE_TEST_MODE", "wait");
    const controller = new AbortController();
    const rejected = expect(archive(controller.signal)).rejects.toMatchObject({
      isCanceled: true,
    });
    try {
      await vi.waitFor(async () =>
        expect(await fs.readdir(readyDir)).toHaveLength(1),
      );
    } finally {
      controller.abort();
      await rejected;
    }
    expect(saveAssetFromFile).not.toHaveBeenCalled();
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it("cleans up if saving the archive throws", async () => {
    const error = new Error("storage unavailable");
    vi.mocked(saveAssetFromFile).mockRejectedValueOnce(error);
    await expect(archive()).rejects.toBe(error);
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it.each([false, true])(
    "warns on cleanup failure without changing the result (save fails: %s)",
    async (saveFails) => {
      const cleanupError = new Error("permission denied");
      const saveError = new Error("storage unavailable");
      const remove = fs.rm;
      vi.spyOn(fs, "rm").mockImplementation((target, options) => {
        if (typeof target === "string" && path.dirname(target) === tempDir) {
          return Promise.reject(cleanupError);
        }
        return remove(target, options);
      });
      if (saveFails) {
        vi.mocked(saveAssetFromFile).mockRejectedValueOnce(saveError);
        await expect(archive()).rejects.toBe(saveError);
      } else {
        await expect(archive()).resolves.toMatchObject({
          contentType: "text/html",
          size: 26,
        });
      }
      expect(logger.warn).toHaveBeenCalledWith(
        "[Crawler][job] Failed to clean up archive temporary directory: permission denied",
      );
    },
  );

  it("cleans up archives rejected by the size limit", async () => {
    serverConfig.crawler.fullPageArchiveMaxSizeMb = 1 / (1024 * 1024);
    await expect(archive()).resolves.toBeNull();
    expect(saveAssetFromFile).not.toHaveBeenCalled();
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it("cleans up archives rejected by the final quota check", async () => {
    vi.mocked(QuotaService.checkStorageQuota)
      .mockResolvedValueOnce(QuotaApproved._create("user", 1024))
      .mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(archive()).resolves.toBeNull();
    expect(saveAssetFromFile).not.toHaveBeenCalled();
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it("does not create temporary files when the initial quota check fails", async () => {
    vi.mocked(QuotaService.checkStorageQuota).mockRejectedValueOnce(
      new Error("quota exceeded"),
    );
    await expect(archive()).resolves.toBeNull();
    expect(await fs.readdir(readyDir)).toEqual([]);
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it("keeps concurrent archives isolated while one is canceled", async () => {
    vi.stubEnv("ARCHIVE_TEST_MODE", "wait");
    const controller = new AbortController();
    const rejected = expect(archive(controller.signal)).rejects.toMatchObject({
      isCanceled: true,
    });
    try {
      await vi.waitFor(async () =>
        expect(await fs.readdir(readyDir)).toHaveLength(1),
      );
      const [runningId] = await fs.readdir(readyDir);
      const runningPath = await fs.readFile(
        path.join(readyDir, runningId!),
        "utf8",
      );
      vi.stubEnv("ARCHIVE_TEST_MODE", "success");
      const result = await archive();
      expect(result).not.toBeNull();
      expect(await fs.readFile(runningPath, "utf8")).toBe(
        "<html>archived page</html>",
      );
      expect(await fs.readdir(tempDir)).toEqual([
        path.basename(path.dirname(runningPath)),
      ]);
    } finally {
      controller.abort();
      await rejected;
    }
    expect(await fs.readdir(tempDir)).toEqual([]);
  });
});
