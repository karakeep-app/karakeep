import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockTool, mockTurndown } = vi.hoisted(() => ({
  mockClient: {
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
  mockTool: vi.fn(),
  mockTurndown: { turndown: vi.fn((s: string) => s) },
}));

vi.mock("./shared", () => ({
  karakeepClient: mockClient,
  mcpServer: { tool: mockTool },
  turndownService: mockTurndown,
}));

import { deleteBookmarkHandler, getBookmarkContentHandler } from "./bookmarks";

const textOf = (result: CallToolResult): string => {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected text content, got ${JSON.stringify(first)}`);
  }
  return first.text;
};

const sampleBookmark = {
  id: "bookmark_1",
  createdAt: "2026-01-01T00:00:00Z",
  modifiedAt: "2026-01-01T00:00:00Z",
  title: "Rust async book",
  archived: false,
  favourited: false,
  taggingStatus: "success" as const,
  note: null,
  summary: null,
  tags: [],
  content: {
    type: "link" as const,
    url: "https://example.com",
    title: "Sample",
    description: null,
    author: null,
    publisher: null,
    datePublished: null,
    dateModified: null,
    imageUrl: null,
    imageAssetId: null,
    screenshotAssetId: null,
    fullPageArchiveAssetId: null,
    videoAssetId: null,
    favicon: null,
    htmlContent: null,
    crawledAt: null,
    crawlStatus: null,
    crawlStatusCode: null,
    contentAssetId: null,
  },
  assets: [],
};

beforeEach(() => {
  mockClient.GET.mockReset();
  mockClient.POST.mockReset();
  mockClient.PUT.mockReset();
  mockClient.PATCH.mockReset();
  mockClient.DELETE.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("delete-bookmark", () => {
  it("fetches the bookmark, deletes it, and reports the title", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: sampleBookmark,
      error: undefined,
    });
    mockClient.DELETE.mockResolvedValueOnce({
      data: undefined,
      error: undefined,
    });

    const result = await deleteBookmarkHandler({ bookmarkId: "bookmark_1" });

    expect(mockClient.GET).toHaveBeenCalledWith("/bookmarks/{bookmarkId}", {
      params: {
        path: { bookmarkId: "bookmark_1" },
        query: { includeContent: false },
      },
    });
    expect(mockClient.DELETE).toHaveBeenCalledWith("/bookmarks/{bookmarkId}", {
      params: { path: { bookmarkId: "bookmark_1" } },
    });
    const text = textOf(result);
    expect(text).toContain("Rust async book");
    expect(text).toContain("bookmark_1");
  });

  it("falls back to id when bookmark has no title", async () => {
    const titleless = {
      ...sampleBookmark,
      title: null,
      content: { ...sampleBookmark.content, title: null },
    };
    mockClient.GET.mockResolvedValueOnce({ data: titleless, error: undefined });
    mockClient.DELETE.mockResolvedValueOnce({
      data: undefined,
      error: undefined,
    });

    const result = await deleteBookmarkHandler({ bookmarkId: "bookmark_1" });

    expect(textOf(result)).toContain(`"bookmark_1"`);
  });

  it("skips DELETE when the bookmark is not found", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "Bookmark not found" },
    });

    const result = await deleteBookmarkHandler({ bookmarkId: "missing" });

    expect(mockClient.DELETE).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it("surfaces DELETE failure", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: sampleBookmark,
      error: undefined,
    });
    mockClient.DELETE.mockResolvedValueOnce({
      data: undefined,
      error: { code: "INTERNAL", message: "boom" },
    });

    const result = await deleteBookmarkHandler({ bookmarkId: "bookmark_1" });

    expect(result.isError).toBe(true);
  });
});

describe("get-bookmark-content", () => {
  it("coerces null htmlContent to empty string before turndown (regression for #2914)", async () => {
    mockTurndown.turndown.mockClear();
    mockClient.GET.mockResolvedValueOnce({
      data: {
        ...sampleBookmark,
        content: {
          ...sampleBookmark.content,
          htmlContent: null,
        },
      },
      error: undefined,
    });

    const result = await getBookmarkContentHandler({
      bookmarkId: "bookmark_1",
    });

    expect(mockTurndown.turndown).toHaveBeenCalledWith("");
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe("");
  });

  it("passes htmlContent through to turndown when it is a string", async () => {
    mockTurndown.turndown.mockClear();
    mockTurndown.turndown.mockReturnValueOnce("# rendered");
    mockClient.GET.mockResolvedValueOnce({
      data: {
        ...sampleBookmark,
        content: {
          ...sampleBookmark.content,
          htmlContent: "<h1>hello</h1>",
        },
      },
      error: undefined,
    });

    const result = await getBookmarkContentHandler({
      bookmarkId: "bookmark_1",
    });

    expect(mockTurndown.turndown).toHaveBeenCalledWith("<h1>hello</h1>");
    expect(textOf(result)).toBe("# rendered");
  });

  it("returns text content directly for text bookmarks (no turndown call)", async () => {
    mockTurndown.turndown.mockClear();
    mockClient.GET.mockResolvedValueOnce({
      data: {
        ...sampleBookmark,
        content: {
          type: "text" as const,
          text: "the stored text",
          sourceUrl: null,
        },
      },
      error: undefined,
    });

    const result = await getBookmarkContentHandler({
      bookmarkId: "bookmark_1",
    });

    expect(mockTurndown.turndown).not.toHaveBeenCalled();
    expect(textOf(result)).toBe("the stored text");
  });

  it("surfaces an MCP error when the bookmark is not found", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "Bookmark not found" },
    });

    const result = await getBookmarkContentHandler({ bookmarkId: "missing" });

    expect(result.isError).toBe(true);
  });
});
