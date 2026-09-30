import { beforeEach, describe, expect, it, vi } from "vitest";
import superjson from "superjson";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const { entries, failWrite } = vi.hoisted(() => ({
  entries: new Map<string, string>(),
  failWrite: { key: undefined as string | undefined },
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => entries.get(key),
    set: (key: string, value: string) => {
      if (failWrite.key === key) {
        failWrite.key = undefined;
        throw new Error("disk full");
      }
      entries.set(key, value);
    },
    remove: (key: string) => entries.delete(key),
    getAllKeys: () => [...entries.keys()],
    clearAll: () => entries.clear(),
  }),
  useMMKVString: vi.fn(),
}));

import type { OfflineArticle } from "./offlineLibrary";
import {
  getOfflineLibrary,
  pruneAutomaticOfflineArticles,
  saveOfflineArticle,
} from "./offlineLibrary";

const article = (id: string): OfflineArticle => ({
  schemaVersion: 3,
  bookmarkId: id,
  savedAt: 100,
  bookmark: {
    id,
    userId: "user",
    createdAt: new Date(),
    modifiedAt: null,
    archived: false,
    favourited: false,
    taggingStatus: null,
    summarizationStatus: null,
    embeddingStatus: null,
    tags: [],
    assets: [],
    content: { type: BookmarkTypes.TEXT, text: "Article body" },
  },
});

beforeEach(() => {
  entries.clear();
  failWrite.key = undefined;
});
describe("automatic versus manual retention", () => {
  it("marks new automatic copies and keeps separate account scopes", () => {
    saveOfflineArticle("account-a", article("a"), true);
    expect(getOfflineLibrary("account-a")[0].automatic).toBe(true);
    expect(getOfflineLibrary("account-b")).toEqual([]);
  });

  it("never converts a manual save into an automatic copy", () => {
    saveOfflineArticle("account", article("a"));
    saveOfflineArticle("account", article("a"), true);
    expect(getOfflineLibrary("account")[0].automatic).toBe(false);
  });

  it("pins an automatic copy when the user explicitly saves it", () => {
    saveOfflineArticle("account", article("a"), true);
    saveOfflineArticle("account", article("a"));
    expect(getOfflineLibrary("account")[0].automatic).toBe(false);
  });

  it("treats older manifests without provenance as protected manual copies", () => {
    saveOfflineArticle("account", article("legacy"));
    const key = "manifest:v3:account";
    const items = superjson.parse<
      { bookmarkId: string; automatic?: boolean }[]
    >(entries.get(key)!);
    delete items[0].automatic;
    entries.set(key, superjson.stringify(items));
    saveOfflineArticle("account", article("legacy"), true);
    pruneAutomaticOfflineArticles("account", new Set());
    expect(getOfflineLibrary("account")[0].bookmarkId).toBe("legacy");
  });

  it("restores the previous copy and manifest when storage fails", () => {
    saveOfflineArticle("account", article("a"), true);
    const previous = new Map(entries);
    failWrite.key = "manifest:v3:account";
    const updated = article("a");
    updated.bookmark.content = { type: BookmarkTypes.TEXT, text: "New body" };
    expect(() => saveOfflineArticle("account", updated, true)).toThrow(
      "disk full",
    );
    expect(entries).toEqual(previous);
  });

  it("retains only automatic entries selected for cleanup", () => {
    saveOfflineArticle("account", article("manual"));
    saveOfflineArticle("account", article("old"), true);
    saveOfflineArticle("account", article("recent"), true);
    const keep = new Set(["recent"]);
    pruneAutomaticOfflineArticles("account", keep);
    expect(getOfflineLibrary("account").map((item) => item.bookmarkId)).toEqual(
      ["recent", "manual"],
    );
  });
});
