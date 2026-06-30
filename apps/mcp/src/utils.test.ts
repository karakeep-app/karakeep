import { describe, expect, it } from "vitest";

import { compactBookmark, compactTag, pickDefined } from "./utils";

describe("pickDefined", () => {
  it("strips undefined and preserves null + falsy values", () => {
    const out = pickDefined({
      a: "kept",
      b: undefined,
      c: null,
      d: false,
      e: 0,
      f: "",
    });
    expect(out).toEqual({ a: "kept", c: null, d: false, e: 0, f: "" });
    expect("b" in out).toBe(false);
  });
});

describe("compactTag", () => {
  it("renders human and ai sub-counts with zero fallbacks", () => {
    const text = compactTag({
      id: "tag_1",
      name: "rust",
      numBookmarks: 3,
      numBookmarksByAttachedType: { human: 3 },
    });
    expect(text).toContain("Tag ID: tag_1");
    expect(text).toContain("Bookmarks: 3 (human: 3, ai: 0)");
  });
});

describe("compactBookmark", () => {
  const base = {
    id: "bookmark_1",
    createdAt: "2026-01-01T00:00:00Z",
    modifiedAt: "2026-01-01T00:00:00Z",
    title: null,
    archived: false,
    favourited: false,
    taggingStatus: "success" as const,
    summarizationStatus: "success" as const,
    embeddingStatus: "success" as const,
    note: null,
    summary: null,
    userId: "user_1",
    tags: [],
    assets: [],
  };

  it("renders the Text: line for text-type bookmarks", () => {
    const out = compactBookmark({
      ...base,
      content: {
        type: "text",
        text: "the actual stored text",
        sourceUrl: null,
      },
    });
    expect(out).toContain("Bookmark type: text");
    expect(out).toContain("Text: the actual stored text");
  });

  it("does not emit a Text: line for link-type bookmarks", () => {
    const out = compactBookmark({
      ...base,
      content: {
        type: "link",
        url: "https://example.com",
      },
    });
    expect(out).toContain("Bookmark type: link");
    expect(out).not.toContain("Text:");
  });
});
