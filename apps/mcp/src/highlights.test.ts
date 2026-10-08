import type { CallToolResult } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockTool } = vi.hoisted(() => ({
  mockClient: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
  mockTool: vi.fn(),
}));

vi.mock("./shared", () => ({
  karakeepClient: mockClient,
  registerTool: mockTool,
}));

import {
  createHighlightHandler,
  deleteHighlightHandler,
  getBookmarkHighlightsHandler,
  getHighlightHandler,
  listHighlightsHandler,
  updateHighlightHandler,
} from "./highlights";

const textOf = (result: CallToolResult): string => {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected text content, got ${JSON.stringify(first)}`);
  }
  return first.text;
};

const sampleHighlight = {
  id: "highlight_1",
  bookmarkId: "bookmark_1",
  userId: "user_1",
  startOffset: 10,
  endOffset: 20,
  color: "yellow" as const,
  text: "highlighted text",
  note: "important",
  createdAt: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  mockClient.GET.mockReset();
  mockClient.POST.mockReset();
  mockClient.PATCH.mockReset();
  mockClient.DELETE.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("list-highlights", () => {
  it("forwards pagination and returns formatted highlights", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { highlights: [sampleHighlight], nextCursor: "next_page" },
      error: undefined,
    });

    const result = await listHighlightsHandler({
      limit: 20,
      cursor: "current_page",
    });

    expect(mockClient.GET).toHaveBeenCalledWith("/highlights", {
      params: { query: { limit: 20, cursor: "current_page" } },
    });
    const text = textOf(result);
    expect(text).toContain("Highlight ID: highlight_1");
    expect(text).toContain("Bookmark ID: bookmark_1");
    expect(text).toContain("Next page cursor: next_page");
  });

  it("returns a useful empty state", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { highlights: [], nextCursor: null },
      error: undefined,
    });

    expect(textOf(await listHighlightsHandler({}))).toBe(
      "No highlights found.",
    );
  });
});

describe("get-bookmark-highlights", () => {
  it("returns highlights for one bookmark", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { highlights: [sampleHighlight] },
      error: undefined,
    });

    const result = await getBookmarkHighlightsHandler({
      bookmarkId: "bookmark_1",
    });

    expect(mockClient.GET).toHaveBeenCalledWith(
      "/bookmarks/{bookmarkId}/highlights",
      {
        params: { path: { bookmarkId: "bookmark_1" } },
      },
    );
    expect(textOf(result)).toContain("highlighted text");
  });

  it("surfaces bookmark lookup errors", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "Bookmark not found" },
    });

    const result = await getBookmarkHighlightsHandler({
      bookmarkId: "missing",
    });

    expect(result.isError).toBe(true);
  });
});

describe("get-highlight", () => {
  it("returns a single highlight", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: sampleHighlight,
      error: undefined,
    });

    const result = await getHighlightHandler({ highlightId: "highlight_1" });

    expect(mockClient.GET).toHaveBeenCalledWith("/highlights/{highlightId}", {
      params: { path: { highlightId: "highlight_1" } },
    });
    expect(textOf(result)).toContain("Range: 10-20");
  });
});

describe("create-highlight", () => {
  it("creates and returns a highlight", async () => {
    mockClient.POST.mockResolvedValueOnce({
      data: sampleHighlight,
      error: undefined,
    });

    const input = {
      bookmarkId: "bookmark_1",
      startOffset: 10,
      endOffset: 20,
      color: "yellow" as const,
      text: "highlighted text",
      note: "important",
    };
    const result = await createHighlightHandler(input);

    expect(mockClient.POST).toHaveBeenCalledWith("/highlights", {
      body: input,
    });
    expect(textOf(result)).toContain("Highlight ID: highlight_1");
  });

  it("rejects an empty or reversed range without calling the API", async () => {
    const result = await createHighlightHandler({
      bookmarkId: "bookmark_1",
      startOffset: 20,
      endOffset: 10,
      text: null,
      note: null,
    });

    expect(mockClient.POST).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/endOffset must be greater/i);
  });
});

describe("update-highlight", () => {
  it("sends only fields that were provided", async () => {
    mockClient.PATCH.mockResolvedValueOnce({
      data: { ...sampleHighlight, color: "blue", note: null },
      error: undefined,
    });

    const result = await updateHighlightHandler({
      highlightId: "highlight_1",
      color: "blue",
      note: null,
    });

    expect(mockClient.PATCH).toHaveBeenCalledWith("/highlights/{highlightId}", {
      params: { path: { highlightId: "highlight_1" } },
      body: { color: "blue", note: null },
    });
    expect(textOf(result)).toContain("Color: blue");
  });

  it("rejects calls with no changed fields", async () => {
    const result = await updateHighlightHandler({
      highlightId: "highlight_1",
    });

    expect(mockClient.PATCH).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });
});

describe("delete-highlight", () => {
  it("deletes the highlight and identifies its bookmark", async () => {
    mockClient.DELETE.mockResolvedValueOnce({
      data: sampleHighlight,
      error: undefined,
    });

    const result = await deleteHighlightHandler({
      highlightId: "highlight_1",
    });

    expect(mockClient.DELETE).toHaveBeenCalledWith(
      "/highlights/{highlightId}",
      {
        params: { path: { highlightId: "highlight_1" } },
      },
    );
    expect(textOf(result)).toContain("Deleted highlight highlight_1");
    expect(textOf(result)).toContain("bookmark_1");
  });

  it("surfaces delete errors", async () => {
    mockClient.DELETE.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "Highlight not found" },
    });

    const result = await deleteHighlightHandler({
      highlightId: "missing",
    });

    expect(result.isError).toBe(true);
  });
});
