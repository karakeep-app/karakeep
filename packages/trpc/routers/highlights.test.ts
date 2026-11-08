import { beforeEach, describe, expect, test } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Highlight Routes", () => {
  test<CustomTestContext>("create highlight", async ({ apiCallers }) => {
    const api = apiCallers[0].highlights;
    const bookmarksApi = apiCallers[0].bookmarks;

    // First, create a valid bookmark
    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });
    const bookmarkId = bookmark.id;

    const highlight = await api.create({
      bookmarkId,
      startOffset: 10,
      endOffset: 20,
      color: "yellow",
      text: "Test highlight text",
      note: "Test note",
    });

    const res = await api.get({ highlightId: highlight.id });
    expect(res.bookmarkId).toEqual(bookmarkId);
    expect(res.startOffset).toEqual(10);
    expect(res.endOffset).toEqual(20);
    expect(res.color).toEqual("yellow");
    expect(res.text).toEqual("Test highlight text");
    expect(res.note).toEqual("Test note");
  });

  test<CustomTestContext>("delete highlight", async ({ apiCallers }) => {
    const api = apiCallers[0].highlights;
    const bookmarksApi = apiCallers[0].bookmarks;

    // First, create a valid bookmark
    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });
    const bookmarkId = bookmark.id;

    // Create the highlight first
    const highlight = await api.create({
      bookmarkId,
      startOffset: 10,
      endOffset: 20,
      color: "yellow",
      text: "Test highlight text",
      note: "Test note",
    });

    // It should exist
    await api.get({ highlightId: highlight.id });

    // Delete it
    await api.delete({ highlightId: highlight.id });

    // It shouldn't be there anymore
    await expect(() => api.get({ highlightId: highlight.id })).rejects.toThrow(
      /Highlight not found/,
    );
  });

  test<CustomTestContext>("update highlight", async ({ apiCallers }) => {
    const api = apiCallers[0].highlights;
    const bookmarksApi = apiCallers[0].bookmarks;

    // First, create a valid bookmark
    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });
    const bookmarkId = bookmark.id;

    // Create the highlight
    const highlight = await api.create({
      bookmarkId,
      startOffset: 10,
      endOffset: 20,
      color: "yellow",
      text: "Original text",
      note: "Original note",
    });

    await api.update({
      highlightId: highlight.id,
      color: "blue",
    });

    const res = await api.get({ highlightId: highlight.id });
    expect(res.color).toEqual("blue");
    expect(res.text).toEqual("Original text"); // Only color is updated in the router
  });

  test<CustomTestContext>("get highlight", async ({ apiCallers }) => {
    const api = apiCallers[0].highlights;
    const bookmarksApi = apiCallers[0].bookmarks;

    // First, create a valid bookmark
    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });
    const bookmarkId = bookmark.id;

    // Create the highlight
    const createdHighlight = await api.create({
      bookmarkId,
      startOffset: 10,
      endOffset: 20,
      color: "yellow",
      text: "Test text",
      note: "Test note",
    });

    const res = await api.get({ highlightId: createdHighlight.id });
    expect(res.id).toEqual(createdHighlight.id);
    expect(res.bookmarkId).toEqual(bookmarkId);
  });

  test<CustomTestContext>("get highlights for bookmark", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].highlights;
    const bookmarksApi = apiCallers[0].bookmarks;
    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });
    const bookmarkId = bookmark.id;

    const highlight1 = await api.create({
      bookmarkId,
      startOffset: 10,
      endOffset: 20,
      color: "yellow",
      text: "Highlight 1",
      note: "",
    });

    const highlight2 = await api.create({
      bookmarkId,
      startOffset: 30,
      endOffset: 40,
      color: "blue",
      text: "Highlight 2",
      note: "",
    });

    const res = await api.getForBookmark({ bookmarkId });
    expect(res.highlights.length).toBeGreaterThanOrEqual(2);
    expect(res.highlights.some((h) => h.id === highlight1.id)).toBeTruthy();
    expect(res.highlights.some((h) => h.id === highlight2.id)).toBeTruthy();
  });

  test<CustomTestContext>("get all highlights with pagination", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].highlights;
    const bookmarksApi = apiCallers[0].bookmarks;
    const bookmark = await bookmarksApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });
    const bookmarkId = bookmark.id;

    // Create multiple highlights
    await api.create({
      bookmarkId,
      startOffset: 10,
      endOffset: 20,
      color: "yellow",
      text: "Highlight 1",
      note: "",
    });
    await api.create({
      bookmarkId,
      startOffset: 30,
      endOffset: 40,
      color: "blue",
      text: "Highlight 2",
      note: "",
    });
    await api.create({
      bookmarkId,
      startOffset: 50,
      endOffset: 60,
      color: "green",
      text: "Highlight 3",
      note: "",
    });

    const res = await api.getAll({ limit: 2 });
    expect(res.highlights.length).toEqual(2);
    expect(res.nextCursor).toBeDefined(); // Should have a next cursor
  });

  test<CustomTestContext>("privacy for highlights", async ({ apiCallers }) => {
    const apiUser1 = apiCallers[0].highlights;
    const apiUser2 = apiCallers[1].highlights;
    const bookmarksApiUser1 = apiCallers[0].bookmarks;
    const bookmarksApiUser2 = apiCallers[1].bookmarks;

    const bookmarkUser1 = await bookmarksApiUser1.createBookmark({
      url: "https://user1-example.com",
      type: BookmarkTypes.LINK,
    });
    const bookmarkIdUser1 = bookmarkUser1.id;

    const bookmarkUser2 = await bookmarksApiUser2.createBookmark({
      url: "https://user2-example.com",
      type: BookmarkTypes.LINK,
    });
    const bookmarkIdUser2 = bookmarkUser2.id;

    const highlightUser1 = await apiUser1.create({
      bookmarkId: bookmarkIdUser1,
      startOffset: 10,
      endOffset: 20,
      color: "yellow",
      text: "User1 highlight",
      note: "",
    });

    const highlightUser2 = await apiUser2.create({
      bookmarkId: bookmarkIdUser2,
      startOffset: 10,
      endOffset: 20,
      color: "blue",
      text: "User2 highlight",
      note: "",
    });

    // User1 should not access User2's highlight
    await expect(() =>
      apiUser1.get({ highlightId: highlightUser2.id }),
    ).rejects.toThrow(/User is not allowed to access resource/);

    // User2 should not access User1's highlight
    await expect(() =>
      apiUser2.get({ highlightId: highlightUser1.id }),
    ).rejects.toThrow(/User is not allowed to access resource/);
  });

  test<CustomTestContext>("getAll and search return the bookmark's title and url", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].highlights;
    const bookmarksApi = apiCallers[0].bookmarks;

    const untitled = await bookmarksApi.createBookmark({
      url: "https://example.com/untitled",
      type: BookmarkTypes.LINK,
    });
    const titled = await bookmarksApi.createBookmark({
      url: "https://example.com/titled",
      type: BookmarkTypes.LINK,
      title: "A custom title",
    });
    const note = await bookmarksApi.createBookmark({
      text: "A text bookmark",
      type: BookmarkTypes.TEXT,
    });

    for (const { id } of [untitled, titled, note]) {
      await api.create({
        bookmarkId: id,
        startOffset: 0,
        endOffset: 5,
        color: "yellow",
        text: `quote ${id}`,
        note: null,
      });
    }

    const bookmarkOf = (
      highlights: { bookmarkId: string; bookmark: unknown }[],
      bookmarkId: string,
    ) => highlights.find((h) => h.bookmarkId === bookmarkId)?.bookmark;

    const { highlights } = await api.getAll({});
    expect(bookmarkOf(highlights, untitled.id)).toEqual({
      title: "https://example.com/untitled",
      url: "https://example.com/untitled",
    });
    expect(bookmarkOf(highlights, titled.id)).toEqual({
      title: "A custom title",
      url: "https://example.com/titled",
    });
    expect(bookmarkOf(highlights, note.id)).toEqual({
      title: null,
      url: null,
    });

    const found = await api.search({ text: `quote ${titled.id}` });
    expect(found.highlights.map((h) => h.bookmark)).toEqual([
      { title: "A custom title", url: "https://example.com/titled" },
    ]);
  });

  test<CustomTestContext>("getAll and search filter by color", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].highlights;
    const bookmark = await apiCallers[0].bookmarks.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });
    for (const color of ["red", "blue"] as const) {
      await api.create({
        bookmarkId: bookmark.id,
        startOffset: 0,
        endOffset: 5,
        color,
        text: "shared words",
        note: null,
      });
    }

    const reds = await api.getAll({ color: "red" });
    expect(reds.highlights.map((h) => h.color)).toEqual(["red"]);

    const blues = await api.search({ text: "shared", color: "blue" });
    expect(blues.highlights.map((h) => h.color)).toEqual(["blue"]);

    const none = await api.getAll({ color: "green" });
    expect(none.highlights).toEqual([]);

    const everything = await api.getAll({});
    expect(everything.highlights).toHaveLength(2);
  });

  test<CustomTestContext>("getAll keeps paginating through the join", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].highlights;
    const bookmark = await apiCallers[0].bookmarks.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });
    for (let i = 0; i < 3; i++) {
      await api.create({
        bookmarkId: bookmark.id,
        startOffset: i,
        endOffset: i + 1,
        color: "yellow",
        text: `quote ${i}`,
        note: null,
      });
    }

    const first = await api.getAll({ limit: 2 });
    expect(first.highlights).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await api.getAll({ limit: 2, cursor: first.nextCursor });
    expect(second.highlights).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.highlights, ...second.highlights].map((h) => h.id);
    expect(new Set(ids).size).toBe(3);
  });
});
