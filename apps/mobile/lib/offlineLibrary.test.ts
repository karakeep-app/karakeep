import { beforeEach, describe, expect, it, vi } from "vitest";
import superjson from "superjson";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const { entries, failWrite } = vi.hoisted(() => ({
  entries: new Map<string, string>(),
  failWrite: {
    key: undefined as string | undefined,
    removeKey: undefined as string | undefined,
  },
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
    remove: (key: string) => {
      if (failWrite.removeKey === key) {
        failWrite.removeKey = undefined;
        throw new Error("remove failed");
      }
      return entries.delete(key);
    },
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
  reconcileOfflineLibrary,
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
  failWrite.removeKey = undefined;
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
  it("keeps complete listed copies when committing the cleanup manifest fails", () => {
    saveOfflineArticle("account", article("old"), true);
    saveOfflineArticle("account", article("manual"));
    const previous = new Map(entries);
    failWrite.key = "manifest:v3:account";
    expect(() => pruneAutomaticOfflineArticles("account", new Set())).toThrow(
      "disk full",
    );
    for (const [key, value] of previous) expect(entries.get(key)).toBe(value);
    reconcileOfflineLibrary("account");
    expect(entries).toEqual(previous);
  });

  it("does not change the manifest if journaling fails", () => {
    saveOfflineArticle("account", article("old"), true);
    const previous = new Map(entries);
    failWrite.key = "automatic-cleanup:v1:account";
    expect(() => pruneAutomaticOfflineArticles("account", new Set())).toThrow(
      "disk full",
    );
    expect(entries).toEqual(previous);
  });

  it.each([
    "article:v3:account:old",
    "content:v3:account:old",
    "automatic-cleanup:v1:account",
  ])(
    "recovers interrupted cleanup at %s without affecting retained copies",
    (key) => {
      saveOfflineArticle("account", article("old"), true);
      saveOfflineArticle("account", article("manual"));
      saveOfflineArticle("account", article("recent"), true);
      // Exercise separate body deletion using a link rather than a text note.
      const old = article("old");
      old.bookmark.content = {
        type: BookmarkTypes.LINK,
        url: "https://example.com",
        htmlContent: "<p>body</p>",
      };
      saveOfflineArticle("account", old, true);
      failWrite.removeKey = key;
      expect(() =>
        pruneAutomaticOfflineArticles("account", new Set(["recent"])),
      ).toThrow("remove failed");
      expect(
        getOfflineLibrary("account").map((item) => item.bookmarkId),
      ).toEqual(["recent", "manual"]);
      expect(entries.has("automatic-cleanup:v1:account")).toBe(true);
      reconcileOfflineLibrary("account");
      expect(entries.has("article:v3:account:old")).toBe(false);
      expect(entries.has("content:v3:account:old")).toBe(false);
      expect(entries.has("automatic-cleanup:v1:account")).toBe(false);
      expect(
        getOfflineLibrary("account").map((item) => item.bookmarkId),
      ).toEqual(["recent", "manual"]);
    },
  );

  it("recovers pending deletions before resaving the same article", () => {
    saveOfflineArticle("account", article("old"), true);
    failWrite.removeKey = "article:v3:account:old";
    expect(() => pruneAutomaticOfflineArticles("account", new Set())).toThrow();
    saveOfflineArticle("account", article("old"));
    reconcileOfflineLibrary("account");
    expect(getOfflineLibrary("account")[0]).toMatchObject({
      bookmarkId: "old",
      automatic: false,
    });
    expect(entries.has("article:v3:account:old")).toBe(true);
  });
});
