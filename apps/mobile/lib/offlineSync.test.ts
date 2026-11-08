import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { assetBookmark, linkBookmark } from "./testing/bookmarks";

interface Page {
  bookmarks: ZBookmark[];
  nextCursor: { createdAt: Date; id: string } | null;
}

interface TestState {
  settings: {
    address: string;
    apiKey: string | undefined;
    apiKeyId: string;
    customHeaders: Record<string, string>;
  };
  network: { isConnected: boolean; isInternetReachable: boolean; type: string };
  lists: Map<string, ZBookmark[] | Error>;
  recent: ZBookmark[];
  repeatCursor: boolean;
  pageRequests: { listId?: string; archived?: boolean }[];
  contentRequests: string[];
  onContentRequest: (() => void) | undefined;
}

const state = vi.hoisted((): TestState => ({
  settings: {
    address: "https://keep.example.com",
    apiKey: "key",
    apiKeyId: "key-id",
    customHeaders: {},
  },
  network: { isConnected: true, isInternetReachable: true, type: "WIFI" },
  lists: new Map(),
  recent: [],
  repeatCursor: false,
  pageRequests: [],
  contentRequests: [],
  onContentRequest: undefined,
}));

vi.mock("react-native-mmkv", async () => {
  const { createFakeMMKV } = await import("./testing/fakeMmkv");
  return { createMMKV: createFakeMMKV, useMMKVString: vi.fn() };
});

vi.mock("./i18n", () => ({
  i18n: {
    t: (key: string) => key,
  },
}));

vi.mock("expo-network", () => ({
  getNetworkStateAsync: async () => state.network,
  NetworkStateType: {
    WIFI: "WIFI",
    ETHERNET: "ETHERNET",
    CELLULAR: "CELLULAR",
  },
}));

vi.mock("expo/fetch", () => ({
  fetch: () => Promise.reject(new Error("no images in these tests")),
}));

vi.mock("./settings", () => ({
  useSettings: {
    getState: () => ({ settings: { settings: state.settings } }),
  },
}));

function page(
  all: ZBookmark[],
  cursor: { id: string } | null | undefined,
  limit: number,
): Page {
  const start = cursor ? Number(cursor.id) : 0;
  const end = start + limit;
  return {
    bookmarks: all.slice(start, end),
    nextCursor:
      end < all.length || state.repeatCursor
        ? { createdAt: new Date(0), id: state.repeatCursor ? "1" : String(end) }
        : null,
  };
}

vi.mock("@karakeep/shared-react/providers/trpc-provider", () => ({
  getTRPCClient: () => ({
    bookmarks: {
      getBookmarks: {
        query: async (input: {
          listId?: string;
          archived?: boolean;
          cursor?: { id: string } | null;
          limit: number;
        }) => {
          state.pageRequests.push({
            listId: input.listId,
            archived: input.archived,
          });
          if (input.listId !== undefined) {
            const list = state.lists.get(input.listId);
            if (list === undefined || list instanceof Error) {
              throw list ?? new Error("unknown list");
            }
            return page(list, input.cursor, input.limit);
          }
          return page(state.recent, input.cursor, input.limit);
        },
      },
      getBookmark: {
        query: async ({ bookmarkId }: { bookmarkId: string }) => {
          state.contentRequests.push(bookmarkId);
          state.onContentRequest?.();
          const bookmark = [
            ...state.recent,
            ...[...state.lists.values()].flat(),
          ]
            .filter((item): item is ZBookmark => !(item instanceof Error))
            .find((item) => item.id === bookmarkId);
          if (!bookmark) {
            throw new Error("not found");
          }
          return bookmark;
        },
      },
    },
  }),
}));

function trpcError(code: string) {
  return Object.assign(new Error(code), { data: { code } });
}

const SCOPE = "https://keep.example.com|key-id";
const OTHER_SCOPE = "https://keep.example.com|other-key-id";

async function load() {
  vi.resetModules();
  return {
    sync: await import("./offlineSync"),
    library: await import("./offlineLibrary"),
    prefs: await import("./offlineDownloadPrefs"),
  };
}

type Modules = Awaited<ReturnType<typeof load>>;

function storedIds(modules: Modules) {
  return modules.library
    .getOfflineLibraryItems(SCOPE)
    .map((item) => `${item.bookmarkId}:${item.source}`)
    .sort();
}

function seed(
  modules: Modules,
  bookmark: ZBookmark,
  source: "manual" | "auto",
) {
  modules.library.saveOfflineArticle(
    SCOPE,
    {
      schemaVersion: modules.library.OFFLINE_LIBRARY_SCHEMA_VERSION,
      bookmarkId: bookmark.id,
      savedAt: Date.now(),
      bookmark,
    },
    source,
  );
}

function setPrefs(
  modules: Modules,
  prefs: Partial<ReturnType<Modules["prefs"]["getOfflineDownloadPrefs"]>>,
) {
  modules.prefs.updateOfflineDownloadPrefs(SCOPE, (current) => ({
    ...current,
    ...prefs,
  }));
}

beforeEach(() => {
  state.settings.apiKey = "key";
  state.settings.apiKeyId = "key-id";
  state.network = {
    isConnected: true,
    isInternetReachable: true,
    type: "WIFI",
  };
  state.lists = new Map();
  state.recent = [];
  state.repeatCursor = false;
  state.pageRequests = [];
  state.contentRequests = [];
  state.onContentRequest = undefined;
});

describe("refreshOfflineDownloads", () => {
  it("waits for Wi-Fi unless cellular is allowed", async () => {
    const modules = await load();
    state.network = {
      isConnected: true,
      isInternetReachable: true,
      type: "CELLULAR",
    };
    state.recent = [linkBookmark("a")];
    setPrefs(modules, { recentEnabled: true });

    const waiting = await modules.sync.refreshOfflineDownloads({ force: true });
    expect(waiting?.phase).toBe("wifi");
    expect(state.pageRequests).toEqual([]);

    setPrefs(modules, { wifiOnly: false });
    const done = await modules.sync.refreshOfflineDownloads({ force: true });
    expect(done).toMatchObject({ phase: "ready", ready: 1, total: 1 });
    expect(storedIds(modules)).toEqual(["a:auto"]);
  });

  it("doesn't wait for the OS to call the internet reachable", async () => {
    const modules = await load();
    state.network = {
      isConnected: true,
      isInternetReachable: false,
      type: "WIFI",
    };
    state.recent = [linkBookmark("a")];
    setPrefs(modules, { recentEnabled: true });

    const status = await modules.sync.refreshOfflineDownloads({ force: true });

    expect(status?.phase).toBe("ready");
    expect(storedIds(modules)).toEqual(["a:auto"]);
  });

  it("downloads every page of a list, and shared articles once", async () => {
    const modules = await load();
    const list = Array.from({ length: 150 }, (_, index) =>
      linkBookmark(`l${index}`, { createdAt: index }),
    );
    state.lists.set("list", list);
    state.recent = [list[149], linkBookmark("r", { createdAt: 500 })];
    setPrefs(modules, { recentEnabled: true, listIds: ["list"] });

    const status = await modules.sync.refreshOfflineDownloads({ force: true });

    expect(status).toMatchObject({ phase: "ready", ready: 151, total: 151 });
    expect(state.pageRequests.filter((request) => request.listId)).toHaveLength(
      2,
    );
    expect(state.contentRequests).toHaveLength(151);
    // Lists come first even though the recent article is newer.
    expect(state.contentRequests[0]).toBe("l149");
    expect(state.contentRequests.at(-1)).toBe("r");
  });

  it("treats a deleted list as empty", async () => {
    const modules = await load();
    seed(modules, linkBookmark("from-list"), "auto");
    seed(modules, linkBookmark("saved"), "manual");
    state.lists.set("gone", trpcError("NOT_FOUND"));
    setPrefs(modules, { listIds: ["gone"] });

    const status = await modules.sync.refreshOfflineDownloads({ force: true });

    expect(status?.phase).toBe("ready");
    expect(storedIds(modules)).toEqual(["saved:manual"]);
    // Deselected too, since settings can't show it any more.
    expect(modules.prefs.getOfflineDownloadPrefs(SCOPE).listIds).toEqual([]);
  });

  it("keeps everything when a list can't be fetched", async () => {
    const modules = await load();
    seed(modules, linkBookmark("from-list"), "auto");
    state.lists.set("list", trpcError("INTERNAL_SERVER_ERROR"));
    setPrefs(modules, { listIds: ["list"] });

    const status = await modules.sync.refreshOfflineDownloads({ force: true });

    expect(status?.phase).toBe("error");
    expect(storedIds(modules)).toEqual(["from-list:auto"]);
  });

  it("stops on a repeated page without removing anything", async () => {
    const modules = await load();
    seed(modules, linkBookmark("old"), "auto");
    state.repeatCursor = true;
    state.recent = [linkBookmark("a"), linkBookmark("b")];
    setPrefs(modules, { recentEnabled: true });

    const status = await modules.sync.refreshOfflineDownloads({ force: true });

    expect(status?.phase).toBe("error");
    expect(storedIds(modules)).toEqual(["old:auto"]);
  });

  it("counts only downloadable articles towards the recent limit", async () => {
    const modules = await load();
    state.recent = [
      assetBookmark("pdf", 9),
      linkBookmark("broken", {
        createdAt: 8,
        crawlStatus: "failure",
        htmlContent: null,
      }),
      linkBookmark("removed", { createdAt: 7.5 }),
      linkBookmark("a", { createdAt: 7 }),
      linkBookmark("b", { createdAt: 6 }),
      linkBookmark("c", { createdAt: 5 }),
    ];
    setPrefs(modules, {
      recentEnabled: true,
      recentLimit: 2,
      excludedIds: ["removed"],
    });

    const status = await modules.sync.refreshOfflineDownloads({ force: true });

    expect(status).toMatchObject({ phase: "ready", ready: 2, total: 2 });
    expect(storedIds(modules)).toEqual(["a:auto", "b:auto"]);
  });

  it("doesn't count an article without reader content as failed", async () => {
    const modules = await load();
    state.recent = [linkBookmark("empty", { htmlContent: null })];
    setPrefs(modules, { recentEnabled: true });

    const status = await modules.sync.refreshOfflineDownloads({ force: true });

    expect(status).toMatchObject({ phase: "ready", total: 0, failed: 0 });
  });

  it("runs a refresh requested during a pass once it ends", async () => {
    const modules = await load();
    state.recent = [linkBookmark("a")];
    setPrefs(modules, { recentEnabled: true });
    state.onContentRequest = () => {
      state.onContentRequest = undefined;
      // Logged out and into another account while the pass ran.
      state.settings.apiKey = undefined;
      modules.library.clearOfflineLibrary();
      modules.prefs.clearOfflineDownloadStorage();
      modules.sync.resetOfflineDownloads();
      state.settings.apiKey = "other-key";
      state.settings.apiKeyId = "other-key-id";
      modules.prefs.updateOfflineDownloadPrefs(OTHER_SCOPE, (current) => ({
        ...current,
        recentEnabled: true,
      }));
      void modules.sync.refreshOfflineDownloads();
    };

    await modules.sync.refreshOfflineDownloads({ force: true });

    expect(
      modules.library
        .getOfflineLibraryItems(OTHER_SCOPE)
        .map((item) => item.bookmarkId),
    ).toEqual(["a"]);
    // The interrupted pass didn't save its download for the old account.
    expect(storedIds(modules)).toEqual([]);
  });

  it("throttles automatic refreshes but not forced ones", async () => {
    const modules = await load();
    state.recent = [linkBookmark("a")];
    setPrefs(modules, { recentEnabled: true });

    await modules.sync.refreshOfflineDownloads();
    await modules.sync.refreshOfflineDownloads();
    expect(state.pageRequests).toHaveLength(1);

    await modules.sync.refreshOfflineDownloads({ force: true });
    expect(state.pageRequests).toHaveLength(2);
  });

  it("removes automatic copies when turned off", async () => {
    const modules = await load();
    seed(modules, linkBookmark("auto"), "auto");
    seed(modules, linkBookmark("saved"), "manual");

    const status = await modules.sync.refreshOfflineDownloads();

    expect(status?.phase).toBe("disabled");
    expect(storedIds(modules)).toEqual(["saved:manual"]);
  });

  it("forgets exclusions that no longer match anything", async () => {
    const modules = await load();
    state.recent = [linkBookmark("kept-out"), linkBookmark("a")];
    setPrefs(modules, {
      recentEnabled: true,
      excludedIds: ["kept-out", "long-gone"],
    });

    await modules.sync.refreshOfflineDownloads({ force: true });

    expect(modules.prefs.getOfflineDownloadPrefs(SCOPE).excludedIds).toEqual([
      "kept-out",
    ]);
    expect(storedIds(modules)).toEqual(["a:auto"]);
  });

  it("writes nothing after logging out mid-download", async () => {
    const modules = await load();
    state.recent = [linkBookmark("a"), linkBookmark("b")];
    setPrefs(modules, { recentEnabled: true });
    state.onContentRequest = () => {
      state.onContentRequest = undefined;
      // What useSession().logout does.
      state.settings.apiKey = undefined;
      modules.library.clearOfflineLibrary();
      modules.prefs.clearOfflineDownloadStorage();
      modules.sync.resetOfflineDownloads();
    };

    const status = await modules.sync.refreshOfflineDownloads({ force: true });

    expect(status).toBeUndefined();
    expect(storedIds(modules)).toEqual([]);
    expect(modules.prefs.offlineDownloadStorage.getAllKeys()).toEqual([]);
  });
});
