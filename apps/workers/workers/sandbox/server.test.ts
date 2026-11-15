// The sandbox's routes, through the clients that call them. The routes' work
// (yt-dlp, the asset parsing) is mocked.
//
// How failures cross the sandbox matters most: the work failing on its input
// (which isn't retried, or is a skipped step) must stay distinguishable from
// the sandbox being unable to do the work (which is retried).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@karakeep/shared/config", () => ({
  default: {
    sandbox: { url: "http://sandbox:4000", token: "token" },
    crawler: { numWorkers: 1, jobTimeoutSec: 60, downloadVideoTimeout: 60 },
    assetPreprocessing: { jobTimeoutSec: 60 },
  },
}));
vi.mock("../crawler/localCrawler", () => ({
  localCrawler: {},
  loadPage: vi.fn(),
  parsePage: vi.fn(),
}));
vi.mock("../video/localVideoDownloader", () => ({
  localVideoDownloader: { download: vi.fn() },
}));
vi.mock("../assetPreprocessing/localAssetProcessor", () => ({
  localAssetProcessor: {
    processPdf: vi.fn(),
    readImageText: vi.fn(),
  },
}));

import type { AssetJob } from "../assetPreprocessing/common";
import { AssetProcessorUnavailableError } from "../assetPreprocessing/common";
import { localAssetProcessor } from "../assetPreprocessing/localAssetProcessor";
import { remoteAssetProcessor } from "../assetPreprocessing/remoteAssetProcessor";
import { localVideoDownloader } from "../video/localVideoDownloader";
import { remoteVideoDownloader } from "../video/remoteVideoDownloader";
import { SandboxError } from "./client";
import { encodeRequest, WORK_FAILED_STATUS } from "./protocol";
import { buildSandboxRoutes } from "./server";

const routes = buildSandboxRoutes("token");

function callSandbox(
  endpoint: string,
  params: object,
  attachments?: { file?: Uint8Array },
) {
  const { contentType, body } = encodeRequest(params, attachments);
  return routes.request(`/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": contentType, Authorization: "Bearer token" },
    body,
  });
}

const videoRequest = {
  jobId: "1",
  url: "https://example.com/video",
  runProxy: { httpProxy: undefined, httpsProxy: undefined, noProxy: undefined },
};

describe("the sandbox's error statuses", () => {
  it("answers a yt-dlp failure with WORK_FAILED_STATUS", async () => {
    vi.mocked(localVideoDownloader.download).mockResolvedValueOnce({
      status: "failed",
      reason: "yt-dlp failed",
    });
    const res = await callSandbox("video", videoRequest);
    expect(res.status).toBe(WORK_FAILED_STATUS);
  });

  it("answers any other video download error with a 500", async () => {
    vi.mocked(localVideoDownloader.download).mockRejectedValueOnce(
      new Error("ENOSPC"),
    );
    const res = await callSandbox("video", videoRequest);
    expect(res.status).toBe(500);
  });

  it("answers an asset that fails to parse with WORK_FAILED_STATUS", async () => {
    vi.mocked(localAssetProcessor.readImageText).mockRejectedValueOnce(
      new Error("Error attempting to read image"),
    );
    const res = await callSandbox(
      "image-text",
      { jobId: "1" },
      { file: new Uint8Array([1, 2, 3]) },
    );
    expect(res.status).toBe(WORK_FAILED_STATUS);
  });

  it("rejects a /pdf request that asks for no steps", async () => {
    const res = await callSandbox(
      "pdf",
      { jobId: "1", text: false, screenshot: false },
      { file: new Uint8Array([1, 2, 3]) },
    );
    expect(res.status).toBe(400);
  });
});

describe("the clients' handling of the sandbox's errors", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  const respondWith = (status: number) =>
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), { status }),
    );
  const unreachable = () =>
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

  const download = () =>
    remoteVideoDownloader.download({
      ...videoRequest,
      assetId: "asset",
      abortSignal: new AbortController().signal,
    });

  it("doesn't retry a video that yt-dlp failed to download", async () => {
    respondWith(WORK_FAILED_STATUS);
    await expect(download()).resolves.toMatchObject({ status: "failed" });
  });

  it.each([500, 502, 503])(
    "retries a video download answered with %i",
    async (status) => {
      respondWith(status);
      await expect(download()).rejects.toBeInstanceOf(SandboxError);
    },
  );

  it("retries a video download when the sandbox is unreachable", async () => {
    unreachable();
    await expect(download()).rejects.toThrow("fetch failed");
  });

  const job: AssetJob = {
    jobId: "1",
    abortSignal: new AbortController().signal,
  };
  const readImageText = () =>
    remoteAssetProcessor.readImageText(job, Buffer.from([1, 2, 3]));

  it("reports an asset that failed to parse as the asset's failure", async () => {
    respondWith(WORK_FAILED_STATUS);
    const error = await readImageText().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SandboxError);
    expect(error).not.toBeInstanceOf(AssetProcessorUnavailableError);
  });

  it.each([500, 502, 503])(
    "reports a %i as the sandbox being unavailable",
    async (status) => {
      respondWith(status);
      await expect(readImageText()).rejects.toBeInstanceOf(
        AssetProcessorUnavailableError,
      );
    },
  );

  it("reports an unreachable sandbox as unavailable", async () => {
    unreachable();
    await expect(readImageText()).rejects.toBeInstanceOf(
      AssetProcessorUnavailableError,
    );
  });

  it("returns the text on success", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ text: "hello" }));
    await expect(readImageText()).resolves.toBe("hello");
  });
});

describe("/pdf", () => {
  const job: AssetJob = {
    jobId: "1",
    abortSignal: new AbortController().signal,
  };
  const pdf = Buffer.from("%PDF-1.4");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    // The client talks to the real routes.
    fetchMock.mockImplementation((url, init) =>
      Promise.resolve(
        routes.request(String(url).replace(/^.*\/sandbox\/v1/, ""), init),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("uploads the PDF once and gets back both results", async () => {
    vi.mocked(localAssetProcessor.processPdf).mockResolvedValueOnce({
      text: { ok: true, value: { text: "hello", metadata: { Title: "t" } } },
      screenshot: { ok: true, value: png },
    });
    const result = await remoteAssetProcessor.processPdf(job, pdf, {
      text: true,
      screenshot: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.text).toEqual({
      ok: true,
      value: { text: "hello", metadata: { Title: "t" } },
    });
    expect(result.screenshot).toEqual({ ok: true, value: png });
  });

  it("reports each step's failure on its own", async () => {
    vi.mocked(localAssetProcessor.processPdf).mockResolvedValueOnce({
      text: { ok: false, error: "Invalid PDF structure" },
      screenshot: { ok: true, value: png },
    });
    const result = await remoteAssetProcessor.processPdf(job, pdf, {
      text: true,
      screenshot: true,
    });
    expect(result.text).toEqual({ ok: false, error: "Invalid PDF structure" });
    expect(result.screenshot).toEqual({ ok: true, value: png });
  });

  it("only runs the requested steps", async () => {
    vi.mocked(localAssetProcessor.processPdf).mockResolvedValueOnce({
      screenshot: { ok: false, error: "gm not found" },
    });
    const result = await remoteAssetProcessor.processPdf(job, pdf, {
      text: false,
      screenshot: true,
    });
    expect(vi.mocked(localAssetProcessor.processPdf)).toHaveBeenLastCalledWith(
      expect.anything(),
      pdf,
      expect.objectContaining({ text: false, screenshot: true }),
    );
    expect(result).toEqual({
      screenshot: { ok: false, error: "gm not found" },
    });
  });

  it("treats a response missing a requested step as the sandbox being unavailable", async () => {
    vi.mocked(localAssetProcessor.processPdf).mockResolvedValueOnce({
      text: { ok: true, value: { text: "hello", metadata: null } },
    });
    await expect(
      remoteAssetProcessor.processPdf(job, pdf, {
        text: true,
        screenshot: true,
      }),
    ).rejects.toBeInstanceOf(AssetProcessorUnavailableError);
  });
});
