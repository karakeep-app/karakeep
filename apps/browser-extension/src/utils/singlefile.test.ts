import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capturePageWithSingleFile, uploadSingleFileAsset } from "./singlefile";
import type { Settings } from "./settings";

const url = "https://signed-in.test/article";
const opts = { expectedUrl: url, includeImages: true };
const send = vi.fn();
const inject = vi.fn();
const getTab = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("chrome", {
    tabs: { get: getTab, sendMessage: send },
    scripting: { executeScript: inject },
    runtime: {
      getManifest: () => ({
        content_scripts: [
          { js: ["assets/singlefile-content-script-loader.js"] },
        ],
      }),
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  getTab.mockResolvedValue({ url });
  inject.mockResolvedValue([]);
  send.mockImplementation(async (_tab, message) =>
    message.type === "CAPTURE_READY"
      ? { ready: true }
      : { success: true, url, html: "<html>Private content</html>" },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("capturing a specific open document", () => {
  it("uses only the top frame and includes the expected URL", async () => {
    expect(await capturePageWithSingleFile(7, opts)).toContain(
      "Private content",
    );
    expect(send).toHaveBeenLastCalledWith(
      7,
      { type: "CAPTURE_PAGE", expectedUrl: url, blockImages: false },
      { frameId: 0 },
    );
    expect(inject).not.toHaveBeenCalled();
  });

  it("injects without depending on browser-specific missing-receiver error text", async () => {
    send.mockRejectedValueOnce(new Error("Safari: no message listener"));
    expect(await capturePageWithSingleFile(7, opts)).toContain(
      "Private content",
    );
    expect(inject).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ["assets/singlefile-content-script-loader.js"],
    });
  });

  it("waits until an asynchronously loaded script is ready", async () => {
    send
      .mockRejectedValueOnce(new Error("Missing receiver"))
      .mockRejectedValueOnce(new Error("Module is still loading"));
    expect(await capturePageWithSingleFile(7, opts)).toContain(
      "Private content",
    );
    expect(
      send.mock.calls.filter(([, message]) => message.type === "CAPTURE_READY"),
    ).toHaveLength(3);
  });

  it("reports denied injection instead of proceeding to capture", async () => {
    send.mockRejectedValueOnce(new Error("Missing receiver"));
    inject.mockRejectedValue(new Error("Cannot access this website"));
    await expect(capturePageWithSingleFile(7, opts)).rejects.toThrow(
      "Cannot access",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rejects navigation before capture", async () => {
    getTab.mockResolvedValue({ url: "https://other.test" });
    await expect(capturePageWithSingleFile(7, opts)).rejects.toThrow(
      "page changed",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects navigation during capture", async () => {
    getTab
      .mockResolvedValueOnce({ url })
      .mockResolvedValueOnce({ url: "https://other.test" });
    await expect(capturePageWithSingleFile(7, opts)).rejects.toThrow(
      "page changed",
    );
  });

  it.each([
    undefined,
    { success: true, url, html: "" },
    { success: true, url: "https://wrong.test", html: "wrong page" },
  ])("rejects malformed, empty, or mismatched captures", async (response) => {
    send.mockResolvedValueOnce({ ready: true }).mockResolvedValueOnce(response);
    await expect(capturePageWithSingleFile(7, opts)).rejects.toThrow();
  });

  it("clears timeout timers after success", async () => {
    vi.useFakeTimers();
    await capturePageWithSingleFile(7, opts);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends a capture that never responds", async () => {
    vi.useFakeTimers();
    send
      .mockResolvedValueOnce({ ready: true })
      .mockReturnValueOnce(new Promise(() => undefined));
    const result = expect(capturePageWithSingleFile(7, opts)).rejects.toThrow(
      "timed out",
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("uploading the captured HTML", () => {
  const settings = {
    address: "https://karakeep.test",
    apiKey: "test-key",
    customHeaders: { "X-Test": "fixture" },
  } satisfies Pick<Settings, "address" | "apiKey" | "customHeaders">;

  it("uploads the captured content with the connection the save started with", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ assetId: "archive" })),
    );
    expect(
      await uploadSingleFileAsset(
        "<html>Private content</html>",
        settings,
        "A page",
      ),
    ).toBe("archive");
    const [address, request] = fetchMock.mock.calls[0];
    expect(address).toBe("https://karakeep.test/api/assets");
    expect(request.headers).toEqual({
      Authorization: "Bearer test-key",
      "X-Test": "fixture",
    });
    expect(await request.body.get("file").text()).toContain("Private content");
  });

  it("rejects a successful response without an archive ID", async () => {
    fetchMock.mockResolvedValue(new Response("{}"));
    await expect(uploadSingleFileAsset("html", settings)).rejects.toThrow(
      "archive ID",
    );
  });

  it("reports upload failure without rendering the server's response body", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>Proxy error with sensitive details</html>", {
        status: 413,
      }),
    );
    await expect(uploadSingleFileAsset("html", settings)).rejects.toThrow(
      "HTTP 413",
    );
  });
});
