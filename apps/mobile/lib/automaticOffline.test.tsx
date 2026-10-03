// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

const mock = vi.hoisted(() => ({
  settings: {
    address: "https://example.com",
    apiKey: "key",
    apiKeyId: "id",
    automaticOfflineCount: 1,
    automaticOfflineWifiOnly: true,
    automaticOfflineChargingOnly: false,
    automaticOfflineExcludeArchived: false,
  },
  connection: "online",
  battery: 2,
  list: vi.fn(),
  download: vi.fn(),
  save: vi.fn(),
  prune: vi.fn(),
  appState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));
vi.mock("react-native", () => ({ AppState: mock.appState }));
vi.mock("expo-network", () => ({
  NetworkStateType: { WIFI: "WIFI", UNKNOWN: "UNKNOWN" },
  getNetworkStateAsync: async () => ({ type: "WIFI", isConnected: true }),
  addNetworkStateListener: () => ({ remove: vi.fn() }),
}));
vi.mock("expo-battery", () => ({
  BatteryState: {
    UNKNOWN: 0,
    UNPLUGGED: 1,
    CHARGING: 2,
    FULL: 3,
    NOT_CHARGING: 4,
  },
  getBatteryStateAsync: async () => mock.battery,
  addBatteryStateListener: () => ({ remove: vi.fn() }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPCClient: () => ({
    bookmarks: {
      getBookmarks: { query: mock.list },
      getBookmark: { query: mock.download },
    },
  }),
}));
vi.mock("./settings", () => ({
  default: () => ({ settings: mock.settings }),
  useSettings: { getState: () => ({ settings: { settings: mock.settings } }) },
}));
vi.mock("./useConnectionStatus", () => ({
  useConnectionStatus: () => mock.connection,
}));
vi.mock("./offlineLibrary", () => ({
  getOfflineLibraryScope: () => "account",
  OFFLINE_LIBRARY_SCHEMA_VERSION: 3,
  saveOfflineArticle: mock.save,
  pruneAutomaticOfflineArticles: mock.prune,
}));

import { AutomaticOfflineProvider } from "./automaticOffline";

let root: Root;
async function render() {
  await act(async () => {
    root.render(<AutomaticOfflineProvider>{null}</AutomaticOfflineProvider>);
  });
}
async function reconnect() {
  mock.connection = "device-offline";
  await render();
  mock.connection = "online";
  await render();
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.connection = "online";
  mock.battery = 2;
  Object.assign(mock.settings, {
    automaticOfflineWifiOnly: true,
    automaticOfflineChargingOnly: false,
    automaticOfflineExcludeArchived: false,
  });
  mock.list.mockReset().mockResolvedValue({ bookmarks: [], nextCursor: null });
  mock.download
    .mockReset()
    .mockImplementation(async ({ bookmarkId }: { bookmarkId: string }) => ({
      id: bookmarkId,
      content: { type: "link" },
    }));
  mock.save.mockReset();
  mock.prune.mockReset();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe("automatic offline provider", () => {
  it("retries failed listing immediately after connectivity recovers", async () => {
    mock.list.mockRejectedValueOnce(new Error("server unavailable"));
    await render();
    expect(mock.list).toHaveBeenCalledTimes(1);
    await reconnect();
    expect(mock.list).toHaveBeenCalledTimes(2);
    expect(mock.prune).toHaveBeenCalledOnce();
  });

  it("retries partial download failure without waiting 15 minutes", async () => {
    mock.list.mockResolvedValue({
      bookmarks: [{ id: "a", content: { type: "link" } }],
      nextCursor: null,
    });
    mock.download.mockRejectedValueOnce(new Error("temporary failure"));
    await render();
    expect(mock.prune).not.toHaveBeenCalled();
    await reconnect();
    expect(mock.download).toHaveBeenCalledTimes(2);
    expect(mock.save).toHaveBeenCalledOnce();
    expect(mock.prune).toHaveBeenCalledOnce();
  });

  it("does not repeatedly download after a successful run on reconnect", async () => {
    await render();
    await reconnect();
    expect(mock.list).toHaveBeenCalledOnce();
  });

  it("allows a new run after connectivity cancels a pending request, discarding its late response", async () => {
    let resolve: (value: unknown) => void = vi.fn();
    mock.list.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await render();
    await reconnect();
    expect(mock.list).toHaveBeenCalledTimes(2);
    await act(async () =>
      resolve({
        bookmarks: [{ id: "late", content: { type: "link" } }],
        nextCursor: null,
      }),
    );
    expect(mock.download).not.toHaveBeenCalled();
    expect(mock.prune).toHaveBeenCalledOnce();
  });

  it.each([2, 3, 4])(
    "permits charging-only downloads on external power state %s",
    async (battery) => {
      mock.settings.automaticOfflineChargingOnly = true;
      mock.battery = battery;
      await render();
      expect(mock.list).toHaveBeenCalledOnce();
    },
  );

  it.each([0, 1])(
    "blocks charging-only downloads on unknown or unplugged state %s",
    async (battery) => {
      mock.settings.automaticOfflineChargingOnly = true;
      mock.battery = battery;
      await render();
      expect(mock.list).not.toHaveBeenCalled();
    },
  );

  it("filters archived articles server-side when requested", async () => {
    mock.settings.automaticOfflineExcludeArchived = true;
    await render();
    expect(mock.list.mock.calls[0][0].archived).toBe(false);
    mock.settings.automaticOfflineExcludeArchived = false;
    await render();
    expect(mock.list.mock.calls[1][0].archived).toBeUndefined();
  });
});
