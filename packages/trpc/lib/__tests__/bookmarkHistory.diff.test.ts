import { describe, expect, test } from "vitest";

import type { BookmarkHistorySnapshot } from "../bookmarkHistory";
import { diffBookmarkUpdate } from "../bookmarkHistory";

function linkSnapshot(
  overrides: Partial<BookmarkHistorySnapshot> = {},
  link: Partial<NonNullable<BookmarkHistorySnapshot["link"]>> = {},
): BookmarkHistorySnapshot {
  return {
    title: null,
    fallbackTitle: "Crawled title",
    note: null,
    summary: null,
    archived: false,
    favourited: false,
    link: {
      url: "https://example.com",
      description: null,
      author: null,
      publisher: null,
      datePublished: null,
      ...link,
    },
    ...overrides,
  };
}

function textSnapshot(
  overrides: Partial<BookmarkHistorySnapshot> = {},
): BookmarkHistorySnapshot {
  return {
    title: null,
    fallbackTitle: null,
    note: null,
    summary: null,
    archived: false,
    favourited: false,
    link: null,
    ...overrides,
  };
}

describe("diffBookmarkUpdate", () => {
  test("returns nothing when no fields are provided", () => {
    expect(diffBookmarkUpdate(linkSnapshot(), {})).toEqual([]);
  });

  test("returns nothing when the edit dialog resubmits unchanged values", () => {
    // What EditBookmarkDialog sends for an untouched link bookmark: the
    // displayed (crawled) title, "" for null text fields, and the same flags.
    const before = linkSnapshot({ summary: "A summary" });
    expect(
      diffBookmarkUpdate(before, {
        title: "Crawled title",
        url: "https://example.com",
        description: "",
        author: "",
        publisher: "",
        datePublished: null,
        summary: "A summary",
        archived: false,
        favourited: false,
      }),
    ).toEqual([]);
  });

  test("treats null and empty strings as the same value", () => {
    expect(
      diffBookmarkUpdate(linkSnapshot({ note: null }), {
        note: "",
        summary: null,
      }),
    ).toEqual([]);
    expect(
      diffBookmarkUpdate(linkSnapshot({}, { description: "" }), {
        description: null,
      }),
    ).toEqual([]);
  });

  test("records a cleared value as null", () => {
    expect(
      diffBookmarkUpdate(textSnapshot({ note: "Old note" }), { note: "" }),
    ).toEqual([{ field: "note", oldValue: "Old note", newValue: null }]);
  });

  test("diffs the title against what the user sees", () => {
    // No custom title: the crawled title is displayed and used as old value.
    expect(diffBookmarkUpdate(linkSnapshot(), { title: "My title" })).toEqual([
      { field: "title", oldValue: "Crawled title", newValue: "My title" },
    ]);
    // Clearing a custom title falls back to the crawled title.
    expect(
      diffBookmarkUpdate(linkSnapshot({ title: "My title" }), { title: null }),
    ).toEqual([
      { field: "title", oldValue: "My title", newValue: "Crawled title" },
    ]);
    // Clearing a title that was never set changes nothing visible.
    expect(diffBookmarkUpdate(linkSnapshot(), { title: "" })).toEqual([]);
  });

  test("records text bookmark titles from empty", () => {
    expect(diffBookmarkUpdate(textSnapshot(), { title: "Hello" })).toEqual([
      { field: "title", oldValue: null, newValue: "Hello" },
    ]);
  });

  test("trims urls and ignores empty urls like the update does", () => {
    expect(
      diffBookmarkUpdate(linkSnapshot(), { url: "  https://example.com  " }),
    ).toEqual([]);
    expect(diffBookmarkUpdate(linkSnapshot(), { url: "" })).toEqual([]);
    expect(
      diffBookmarkUpdate(linkSnapshot(), { url: "https://example.org " }),
    ).toEqual([
      {
        field: "url",
        oldValue: "https://example.com",
        newValue: "https://example.org",
      },
    ]);
  });

  test("compares published dates at the stored (second) precision", () => {
    const stored = new Date("2024-05-01T10:00:00.000Z");
    const before = linkSnapshot({}, { datePublished: stored });
    expect(
      diffBookmarkUpdate(before, {
        datePublished: new Date("2024-05-01T10:00:00.450Z"),
      }),
    ).toEqual([]);
    expect(
      diffBookmarkUpdate(before, {
        datePublished: new Date("2024-06-02T00:00:00.000Z"),
      }),
    ).toEqual([
      {
        field: "datePublished",
        oldValue: "2024-05-01T10:00:00.000Z",
        newValue: "2024-06-02T00:00:00.000Z",
      },
    ]);
  });

  test("records boolean flags only when they flip", () => {
    const before = textSnapshot({ archived: true });
    expect(
      diffBookmarkUpdate(before, { archived: true, favourited: true }),
    ).toEqual([{ field: "favourited", oldValue: false, newValue: true }]);
  });

  test("ignores link fields for non-link bookmarks", () => {
    expect(
      diffBookmarkUpdate(textSnapshot(), {
        url: "https://example.com",
        description: "x",
      }),
    ).toEqual([]);
  });

  test("returns one entry per changed field", () => {
    const changes = diffBookmarkUpdate(linkSnapshot(), {
      title: "New",
      description: "Desc",
      note: "Note",
      favourited: false,
    });
    expect(changes.map((c) => c.field)).toEqual([
      "title",
      "description",
      "note",
    ]);
  });
});
