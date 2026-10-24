import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTRPCClient } from "@karakeep/shared-react/providers/trpc-provider";

import type { Settings } from "./settings";
import { uploadSingleFileAsset } from "./singlefile";
import { cleanupApiClient, getApiClient, initializeClients } from "./trpc";

const state = vi.hoisted(() => ({
  settings: {} as Settings,
  removeClient: vi.fn(),
}));
vi.mock("./settings", () => ({
  getPluginSettings: async () => state.settings,
}));
vi.mock("./storagePersister", () => ({
  createChromeStorage: () => ({ removeClient: state.removeClient }),
}));

function trpcResponse() {
  return new Response(
    JSON.stringify([{ result: { data: { json: { id: "test-user" } } } }]),
    { headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  state.settings = {
    address: "https://bookmarks.example",
    apiKey: "test-key",
    theme: "system",
    customHeaders: { "X-Proxy-Header": "test-value" },
    showCountBadge: false,
    useBadgeCache: false,
    badgeCacheExpireMs: 1000,
    useSingleFile: false,
    singleFileIncludeImages: true,
    autoSave: true,
  };
  state.removeClient.mockClear();
  cleanupApiClient();
});

afterEach(() => {
  cleanupApiClient();
  vi.useRealTimers();
});

function expectAuth(options: RequestInit) {
  expect(new Headers(options.headers).get("Authorization")).toBe(
    "Bearer test-key",
  );
  expect(new Headers(options.headers).get("X-Proxy-Header")).toBe("test-value");
}

describe("background API client", () => {
  it.each([undefined, "https://bookmarks.example", "https://other.example"])(
    "uses the matching origin opt-in (%s)",
    async (browserSessionOrigin) => {
      state.settings.browserSessionOrigin = browserSessionOrigin;
      const fetchMock = vi.fn().mockImplementation(async () => trpcResponse());
      vi.stubGlobal("fetch", fetchMock);
      const client = await getApiClient();
      await client!.users.whoami.query();
      const [url, options] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(String(url)).toContain("https://bookmarks.example/api/trpc/");
      expect(options.credentials).toBe(
        browserSessionOrigin === state.settings.address ? "include" : undefined,
      );
      expectAuth(options);
    },
  );

  it("replaces the cached client when cookie mode changes and stops including cookies when disabled", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => trpcResponse());
    vi.stubGlobal("fetch", fetchMock);
    const initial = await getApiClient();
    await initializeClients();
    expect(await getApiClient()).toBe(initial);
    state.settings.browserSessionOrigin = state.settings.address;
    await initializeClients();
    const enabled = await getApiClient();
    expect(enabled).not.toBe(initial);
    await enabled!.users.whoami.query();
    expect(
      (
        fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [
          string,
          RequestInit,
        ]
      )[1].credentials,
    ).toBe("include");
    state.settings.browserSessionOrigin = undefined;
    await initializeClients();
    const disabled = await getApiClient();
    expect(disabled).not.toBe(enabled);
    await disabled!.users.whoami.query();
    expect(
      (
        fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [
          string,
          RequestInit,
        ]
      )[1].credentials,
    ).toBeUndefined();
    expect(state.removeClient).toHaveBeenCalled();
  });
});

describe("shared popup tRPC transport", () => {
  it.each([undefined, "include"] as const)(
    "retains auth and abort handling with credentials %s",
    async (credentials) => {
      const fetchMock = vi.fn().mockImplementation(async () => trpcResponse());
      vi.stubGlobal("fetch", fetchMock);
      const client = getTRPCClient({ ...state.settings, credentials });
      await client.users.whoami.query();
      const options = (
        fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      )[1];
      expect(options.credentials).toBe(credentials);
      expectAuth(options);
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.signal!.aborted).toBe(false);
    },
  );

  it("forwards caller cancellation while including session cookies", async () => {
    const fetchMock = vi.fn(
      (_url: unknown, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal!.addEventListener("abort", () =>
            reject(options.signal!.reason),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const client = getTRPCClient({ ...state.settings, credentials: "include" });
    const request = client.users.whoami.query(undefined, {
      signal: controller.signal,
    });
    const rejected = expect(request).rejects.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort(new Error("Test cancellation"));
    await rejected;
    expect(fetchMock.mock.calls[0][1].signal!.aborted).toBe(true);
  });
});

describe("SingleFile asset upload", () => {
  it.each([undefined, "https://bookmarks.example", "https://other.example"])(
    "keeps multipart upload/auth and scopes cookies (%s)",
    async (browserSessionOrigin) => {
      state.settings.browserSessionOrigin = browserSessionOrigin;
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ assetId: "test-asset" })),
        );
      vi.stubGlobal("fetch", fetchMock);
      expect(
        await uploadSingleFileAsset("<html>test</html>", "Test page"),
      ).toBe("test-asset");
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://bookmarks.example/api/assets");
      expect(options.method).toBe("POST");
      expect(options.credentials).toBe(
        browserSessionOrigin === state.settings.address ? "include" : undefined,
      );
      expectAuth(options);
      const file = (options.body as FormData).get("file") as File;
      expect(file.name).toBe("Test_page.html");
      expect(await file.text()).toBe("<html>test</html>");
    },
  );

  it("does not turn a rejected upload into success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })),
    );
    await expect(uploadSingleFileAsset("test")).rejects.toThrow(
      "Failed to upload asset: 403 Forbidden",
    );
  });
});
