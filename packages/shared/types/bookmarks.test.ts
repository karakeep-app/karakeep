import { describe, expect, it } from "vitest";

import { BookmarkTypes, zBookmarkSchema } from "./bookmarks";

describe("zBookmarkSchema", () => {
  it("infers lastSavedAt from createdAt for responses from older servers", () => {
    const createdAt = new Date("2025-01-01T00:00:00Z");
    const bookmark = zBookmarkSchema.parse({
      id: "bookmark_1",
      createdAt,
      modifiedAt: null,
      title: null,
      archived: false,
      favourited: false,
      taggingStatus: null,
      summarizationStatus: null,
      embeddingStatus: null,
      note: null,
      summary: null,
      source: "mobile",
      userId: "user_1",
      tags: [],
      assets: [],
      content: {
        type: BookmarkTypes.TEXT,
        text: "A bookmark from an older server",
        sourceUrl: null,
      },
    });

    expect(bookmark.lastSavedAt).toEqual(createdAt);
  });

  it("preserves lastSavedAt when the server provides it", () => {
    const createdAt = new Date("2025-01-01T00:00:00Z");
    const lastSavedAt = new Date("2026-01-01T00:00:00Z");
    const bookmark = zBookmarkSchema.parse({
      id: "bookmark_1",
      createdAt,
      lastSavedAt,
      modifiedAt: null,
      title: null,
      archived: false,
      favourited: false,
      taggingStatus: null,
      summarizationStatus: null,
      embeddingStatus: null,
      note: null,
      summary: null,
      source: "mobile",
      userId: "user_1",
      tags: [],
      assets: [],
      content: {
        type: BookmarkTypes.TEXT,
        text: "A bookmark from a current server",
        sourceUrl: null,
      },
    });

    expect(bookmark.lastSavedAt).toEqual(lastSavedAt);
  });
});
