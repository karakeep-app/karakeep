import superjson from "superjson";
import { describe, expect, it, vi } from "vitest";

import type { createFakeMMKV } from "./testing/fakeMmkv";
import {
  getOfflineLibraryItems,
  OFFLINE_LIBRARY_SCHEMA_VERSION,
  reconcileOfflineLibrary,
  saveOfflineArticle,
} from "./offlineLibrary";
import { linkBookmark } from "./testing/bookmarks";

const { instances } = vi.hoisted(() => ({
  instances: new Map<string, ReturnType<typeof createFakeMMKV>>(),
}));

vi.mock("react-native-mmkv", async () => {
  const { createFakeMMKV } = await import("./testing/fakeMmkv");
  return {
    createMMKV: ({ id }: { id: string }) => {
      const storage = createFakeMMKV();
      instances.set(id, storage);
      return storage;
    },
    useMMKVString: vi.fn(),
  };
});

function save(scope: string, id: string) {
  const bookmark = linkBookmark(id);
  saveOfflineArticle(scope, {
    schemaVersion: OFFLINE_LIBRARY_SCHEMA_VERSION,
    bookmarkId: id,
    savedAt: 1,
    bookmark,
  });
}

describe("offline library", () => {
  it("treats copies saved before automatic downloads as manual", () => {
    const scope = "legacy";
    save(scope, "a");
    const storage = instances.get("karakeep-offline-library");
    const manifestKey = storage
      ?.getAllKeys()
      .find((key) => key.startsWith("manifest:") && key.endsWith(scope));
    if (!storage || !manifestKey) {
      throw new Error("manifest not written");
    }
    // What an older version of the app wrote.
    storage.set(
      manifestKey,
      superjson.stringify([
        { bookmarkId: "a", savedAt: 1, displayTitle: "Bookmark a" },
      ]),
    );

    expect(getOfflineLibraryItems(scope)).toEqual([
      expect.objectContaining({
        bookmarkId: "a",
        source: "manual",
      }),
    ]);
    expect(getOfflineLibraryItems(scope)[0].byteSize).toBeUndefined();

    reconcileOfflineLibrary(scope);
    expect(getOfflineLibraryItems(scope)[0].byteSize).toBeGreaterThan(0);
  });

  it("keeps accounts apart", () => {
    save("first", "a");
    save("second", "b");
    reconcileOfflineLibrary("first");

    expect(
      getOfflineLibraryItems("first").map((item) => item.bookmarkId),
    ).toEqual(["a"]);
    expect(
      getOfflineLibraryItems("second").map((item) => item.bookmarkId),
    ).toEqual(["b"]);
  });

  it("records where a copy came from", () => {
    saveOfflineArticle(
      "source",
      {
        schemaVersion: OFFLINE_LIBRARY_SCHEMA_VERSION,
        bookmarkId: "a",
        savedAt: 1,
        bookmark: linkBookmark("a"),
      },
      "auto",
    );
    expect(getOfflineLibraryItems("source")[0].source).toBe("auto");
  });
});
