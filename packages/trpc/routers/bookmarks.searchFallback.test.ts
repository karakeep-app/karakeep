import { beforeEach, describe, expect, test } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { APICallerType, CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Bookmark Search Fallback", () => {
  async function createBookmark(
    api: APICallerType,
    title: string,
    url = "https://example.com",
  ) {
    return await api.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url,
      title,
    });
  }

  test<CustomTestContext>("searchBookmarks falls back to title-only search when search engine is not configured", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0]!;

    const a = await createBookmark(api, "Hello World", "https://a.example");
    await createBookmark(api, "Something Else", "https://b.example");
    await createBookmark(api, "HELLO there", "https://c.example");

    const res = await api.bookmarks.searchBookmarks({
      text: "Hello",
      limit: 50,
    });

    expect(res.bookmarks.map((b) => b.id)).toContain(a.id);
    expect(res.bookmarks.map((b) => b.title)).toEqual(
      expect.arrayContaining(["Hello World", "HELLO there"]),
    );
    expect(res.bookmarks.map((b) => b.title)).not.toEqual(
      expect.arrayContaining(["Something Else"]),
    );
    expect(res.nextCursor).toBeNull();
  });

  test<CustomTestContext>("searchBookmarks with empty query returns results without throwing", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0]!;

    await createBookmark(api, "First", "https://first.example");
    await createBookmark(api, "Second", "https://second.example");

    const res = await api.bookmarks.searchBookmarks({
      text: "",
      limit: 10,
    });

    expect(res.bookmarks.length).toBe(2);
  });

  test<CustomTestContext>("searchBookmarks with matcher that yields zero IDs returns empty results", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0]!;

    await createBookmark(api, "First", "https://first.example");
    await createBookmark(api, "Second", "https://second.example");

    const res = await api.bookmarks.searchBookmarks({
      text: "tag:does-not-exist",
      limit: 10,
    });

    expect(res.bookmarks).toEqual([]);
    expect(res.nextCursor).toBeNull();
  });

  test<CustomTestContext>("fallback search treats LIKE wildcards literally", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0]!;

    const plain = await createBookmark(
      api,
      "Hello World",
      "https://plain.example",
    );
    const percent = await createBookmark(
      api,
      "100% Coverage",
      "https://percent.example",
    );

    const res = await api.bookmarks.searchBookmarks({
      text: "%",
      limit: 10,
    });

    const ids = res.bookmarks.map((b) => b.id);
    expect(ids).toContain(percent.id);
    expect(ids).not.toContain(plain.id);
  });
});
