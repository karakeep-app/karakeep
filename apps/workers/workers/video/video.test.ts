import fs from "fs";
import * as os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockConfig, mockExeca, mockResolveRedirect } = vi.hoisted(() => ({
  mockConfig: {
    crawler: {
      maxVideoDownloadSize: 50,
      ytDlpArguments: [] as string[],
    },
  },
  mockExeca: vi.fn(),
  mockResolveRedirect: vi.fn(),
}));

vi.mock("@karakeep/shared/config", () => ({
  default: mockConfig,
}));
vi.mock("execa", () => ({
  execa: mockExeca,
}));
vi.mock("../../network", () => ({
  getProxyAgent: vi.fn(() => undefined),
  resolveValidatedRedirectUrl: mockResolveRedirect,
}));

import { ASSET_TYPES } from "@karakeep/shared-server";

import { detectVideoContentType, VIDEO_TMP_FOLDER } from "./common";
import {
  localVideoDownloader,
  prepareYtDlpArguments,
} from "./localVideoDownloader";

describe("detectVideoContentType", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-mime-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("detects MP4 from ISO BMFF ftyp header regardless of extension", async () => {
    const file = path.join(tmpDir, "video.bin");
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    ]);
    await fs.promises.writeFile(file, mp4Header);
    await expect(detectVideoContentType(file)).resolves.toBe(
      ASSET_TYPES.VIDEO_MP4,
    );
  });

  it("detects WebM from EBML webm header regardless of extension", async () => {
    const file = path.join(tmpDir, "video.bin");
    const webmHeader = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]),
      Buffer.from("webm"),
    ]);
    await fs.promises.writeFile(file, webmHeader);
    await expect(detectVideoContentType(file)).resolves.toBe(
      ASSET_TYPES.VIDEO_WEBM,
    );
  });

  it("detects Matroska from EBML matroska header", async () => {
    const file = path.join(tmpDir, "video.bin");
    const mkvHeader = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88]),
      Buffer.from("matroska"),
    ]);
    await fs.promises.writeFile(file, mkvHeader);
    await expect(detectVideoContentType(file)).resolves.toBe(
      ASSET_TYPES.VIDEO_MKV,
    );
  });

  it("falls back to file extension when magic bytes are absent", async () => {
    const webm = path.join(tmpDir, "clip.webm");
    const mkv = path.join(tmpDir, "clip.mkv");
    const mp4 = path.join(tmpDir, "clip.mp4");
    await fs.promises.writeFile(webm, "fixture");
    await fs.promises.writeFile(mkv, "fixture");
    await fs.promises.writeFile(mp4, "fixture");

    await expect(detectVideoContentType(webm)).resolves.toBe(
      ASSET_TYPES.VIDEO_WEBM,
    );
    await expect(detectVideoContentType(mkv)).resolves.toBe(
      ASSET_TYPES.VIDEO_MKV,
    );
    await expect(detectVideoContentType(mp4)).resolves.toBe(
      ASSET_TYPES.VIDEO_MP4,
    );
  });
});

describe("prepareYtDlpArguments", () => {
  beforeEach(() => {
    mockConfig.crawler.maxVideoDownloadSize = 50;
    mockConfig.crawler.ytDlpArguments = [];
  });

  it("prefers H.264/MP4 and merges output into mp4 by default", () => {
    const args = prepareYtDlpArguments(
      "https://example.com/watch?v=1",
      undefined,
      "/tmp/asset-1",
    );
    expect(args).toEqual([
      "https://example.com/watch?v=1",
      "-f",
      "best[filesize<50M]",
      "-S",
      "vcodec:h264,ext:mp4:m4a",
      "--merge-output-format",
      "mp4",
      "-o",
      "/tmp/asset-1",
      "--no-playlist",
    ]);
  });

  it("respects user-provided format sort and merge-output-format overrides", () => {
    mockConfig.crawler.ytDlpArguments = [
      "-S",
      "res:720",
      "--merge-output-format=mkv",
    ];
    const args = prepareYtDlpArguments(
      "https://example.com/watch?v=1",
      "http://proxy:8080",
      "/tmp/asset-2",
    );
    expect(args).toEqual([
      "https://example.com/watch?v=1",
      "-f",
      "best[filesize<50M]",
      "-S",
      "res:720",
      "--merge-output-format=mkv",
      "-o",
      "/tmp/asset-2",
      "--no-playlist",
      "--proxy",
      "http://proxy:8080",
    ]);
  });
});

describe("localVideoDownloader", () => {
  const assetId = `test-local-video-${Date.now()}`;

  afterEach(async () => {
    vi.clearAllMocks();
    const files = await fs.promises
      .readdir(VIDEO_TMP_FOLDER)
      .catch(() => [] as string[]);
    await Promise.all(
      files
        .filter((f) => f.startsWith(assetId))
        .map((f) =>
          fs.promises.rm(path.join(VIDEO_TMP_FOLDER, f), { force: true }),
        ),
    );
  });

  it("returns the detected MIME type when yt-dlp outputs a WebM file", async () => {
    mockResolveRedirect.mockResolvedValueOnce(
      new URL("https://example.com/watch?v=1"),
    );
    mockExeca.mockImplementationOnce(async (_cmd, args: string[]) => {
      const outIdx = args.indexOf("-o");
      const outPath = `${args[outIdx + 1]}.webm`;
      await fs.promises.writeFile(
        outPath,
        Buffer.concat([
          Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]),
          Buffer.from("webm"),
        ]),
      );
    });

    const result = await localVideoDownloader.download({
      jobId: "job-1",
      url: "https://example.com/watch?v=1",
      runProxy: {
        httpProxy: undefined,
        httpsProxy: undefined,
        noProxy: undefined,
      },
      assetId,
      abortSignal: new AbortController().signal,
    });

    expect(result).toEqual({
      status: "downloaded",
      path: path.join(VIDEO_TMP_FOLDER, `${assetId}.webm`),
      contentType: ASSET_TYPES.VIDEO_WEBM,
    });
  });
});
