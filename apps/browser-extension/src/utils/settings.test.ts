import { beforeEach, expect, it, vi } from "vitest";

const getStorage = vi.fn<() => Promise<Record<string, unknown>>>();

beforeEach(() => {
  getStorage.mockReset();
  vi.resetModules();
  vi.stubGlobal("chrome", { storage: { sync: { get: getStorage } } });
});

it("loads pre-existing settings without enabling browser session cookies", async () => {
  const saved = {
    address: "https://bookmarks.example",
    apiKey: "test-key",
    customHeaders: { "X-Proxy-Header": "test-value" },
  };
  getStorage.mockResolvedValue({ settings: saved });
  const { getPluginSettings } = await import("./settings");
  const result = await getPluginSettings();
  expect(result).toMatchObject(saved);
  expect(result.browserSessionOrigin).toBeUndefined();
  expect(result.autoSave).toBe(true);
});

it("preserves the opted-in server origin across storage reads", async () => {
  getStorage.mockResolvedValue({
    settings: {
      apiKey: "test-key",
      browserSessionOrigin: "https://bookmarks.example",
    },
  });
  const { getPluginSettings } = await import("./settings");
  expect((await getPluginSettings()).browserSessionOrigin).toBe(
    "https://bookmarks.example",
  );
});
