import { describe, expect, it, vi } from "vitest";

const { mockTurndown } = vi.hoisted(() => ({
  mockTurndown: { turndown: vi.fn((s: string) => `md:${s}`) },
}));

vi.mock("./shared", () => ({
  turndownService: mockTurndown,
}));

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

  it("appends turndown-rendered htmlContent for link bookmarks when includeContent is true", () => {
    mockTurndown.turndown.mockClear();
    const out = compactBookmark(
      {
        ...base,
        content: {
          type: "link",
          url: "https://example.com",
          htmlContent: "<p>hi</p>",
        },
      },
      { includeContent: true },
    );
    expect(mockTurndown.turndown).toHaveBeenCalledWith("<p>hi</p>");
    expect(out).toContain("Content: md:<p>hi</p>");
  });

  it("omits Content for link bookmarks when includeContent is false", () => {
    mockTurndown.turndown.mockClear();
    const out = compactBookmark({
      ...base,
      content: {
        type: "link",
        url: "https://example.com",
        htmlContent: "<p>hi</p>",
      },
    });
    expect(mockTurndown.turndown).not.toHaveBeenCalled();
    expect(out).not.toContain("Content:");
  });

  it("appends the raw content field for asset bookmarks when includeContent is true", () => {
    const out = compactBookmark(
      {
        ...base,
        content: {
          type: "asset",
          assetType: "pdf",
          assetId: "asset_1",
          content: "extracted pdf text",
          sourceUrl: null,
        },
      },
      { includeContent: true },
    );
    expect(out).toContain("Bookmark type: media");
    expect(out).toContain("Content: extracted pdf text");
  });
});
