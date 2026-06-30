import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockTool } = vi.hoisted(() => ({
  mockClient: {
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
  mockTool: vi.fn(),
}));

vi.mock("./shared", () => ({
  karakeepClient: mockClient,
  mcpServer: { tool: mockTool },
}));

import {
  deleteTagHandler,
  getTagBookmarksHandler,
  getTagHandler,
  getTagsHandler,
  updateTagHandler,
} from "./tags";

const textOf = (result: CallToolResult): string => {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected text content, got ${JSON.stringify(first)}`);
  }
  return first.text;
};

const sampleTag = {
  id: "tag_42",
  name: "rust",
  numBookmarks: 7,
  numBookmarksByAttachedType: { ai: 2, human: 5 },
};

const sampleBookmark = {
  id: "bookmark_1",
  createdAt: "2026-01-01T00:00:00Z",
  modifiedAt: "2026-01-01T00:00:00Z",
  title: "Sample",
  archived: false,
  favourited: false,
  taggingStatus: "success" as const,
  note: null,
  summary: null,
  tags: [{ id: "tag_42", name: "rust", attachedBy: "human" as const }],
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

describe("get-tags", () => {
  it("returns formatted tags and forwards filters", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { tags: [sampleTag], nextCursor: "abc" },
      error: undefined,
    });

    const result = await getTagsHandler({
      nameContains: "rust",
      sort: "usage",
      limit: 25,
    });

    expect(mockClient.GET).toHaveBeenCalledWith("/tags", {
      params: { query: { nameContains: "rust", sort: "usage", limit: 25 } },
    });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("Tag ID: tag_42");
    expect(text).toContain("Name: rust");
    expect(text).toContain("Bookmarks: 7 (human: 5, ai: 2)");
    expect(text).toContain("Next page cursor: abc");
  });

  it("omits cursor line when there is no next page", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { tags: [sampleTag], nextCursor: null },
      error: undefined,
    });

    const result = await getTagsHandler({});

    expect(textOf(result)).not.toContain("Next page cursor");
  });

  it("returns MCP error on failure", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "UNAUTHORIZED", message: "Bad token" },
    });

    const result = await getTagsHandler({});

    expect(result.isError).toBe(true);
  });
});

describe("get-tag", () => {
  it("returns formatted tag", async () => {
    mockClient.GET.mockResolvedValueOnce({ data: sampleTag, error: undefined });

    const result = await getTagHandler({ tagId: "tag_42" });

    expect(mockClient.GET).toHaveBeenCalledWith("/tags/{tagId}", {
      params: { path: { tagId: "tag_42" } },
    });
    expect(textOf(result)).toContain("Tag ID: tag_42");
  });

  it("returns MCP error on 404", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "Tag not found" },
    });

    const result = await getTagHandler({ tagId: "missing" });

    expect(result.isError).toBe(true);
  });
});

describe("update-tag", () => {
  it("renames the tag and reports the new name", async () => {
    mockClient.PATCH.mockResolvedValueOnce({
      data: { id: "tag_42", name: "Rust" },
      error: undefined,
    });

    const result = await updateTagHandler({ tagId: "tag_42", name: "Rust" });

    expect(mockClient.PATCH).toHaveBeenCalledWith("/tags/{tagId}", {
      params: { path: { tagId: "tag_42" } },
      body: { name: "Rust" },
    });
    expect(textOf(result)).toContain(`Tag tag_42 renamed to "Rust"`);
  });

  it("returns MCP error when the tag is not found", async () => {
    mockClient.PATCH.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "Tag not found" },
    });

    const result = await updateTagHandler({ tagId: "missing", name: "X" });

    expect(result.isError).toBe(true);
  });
});

describe("delete-tag", () => {
  it("fetches the tag, deletes it, and reports the name", async () => {
    mockClient.GET.mockResolvedValueOnce({ data: sampleTag, error: undefined });
    mockClient.DELETE.mockResolvedValueOnce({
      data: undefined,
      error: undefined,
    });

    const result = await deleteTagHandler({ tagId: "tag_42" });

    expect(mockClient.GET).toHaveBeenCalledWith("/tags/{tagId}", {
      params: { path: { tagId: "tag_42" } },
    });
    expect(mockClient.DELETE).toHaveBeenCalledWith("/tags/{tagId}", {
      params: { path: { tagId: "tag_42" } },
    });
    const text = textOf(result);
    expect(text).toContain("rust");
    expect(text).toContain("tag_42");
  });

  it("skips DELETE when GET returns 404", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "Tag not found" },
    });

    const result = await deleteTagHandler({ tagId: "missing" });

    expect(mockClient.DELETE).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it("surfaces DELETE failure", async () => {
    mockClient.GET.mockResolvedValueOnce({ data: sampleTag, error: undefined });
    mockClient.DELETE.mockResolvedValueOnce({
      data: undefined,
      error: { code: "INTERNAL", message: "boom" },
    });

    const result = await deleteTagHandler({ tagId: "tag_42" });

    expect(result.isError).toBe(true);
  });
});

describe("get-tag-bookmarks", () => {
  it("forwards query params and returns formatted bookmarks", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { bookmarks: [sampleBookmark], nextCursor: "next" },
      error: undefined,
    });

    const result = await getTagBookmarksHandler({
      tagId: "tag_42",
      limit: 10,
      sortOrder: "asc",
      includeContent: true,
    });

    expect(mockClient.GET).toHaveBeenCalledWith("/tags/{tagId}/bookmarks", {
      params: {
        path: { tagId: "tag_42" },
        query: { limit: 10, sortOrder: "asc", includeContent: true },
      },
    });
    const text = textOf(result);
    expect(text).toContain("Bookmark ID: bookmark_1");
    expect(text).toContain("Next page cursor: next");
  });

  it("returns MCP error on 404", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "Tag not found" },
    });

    const result = await getTagBookmarksHandler({ tagId: "missing" });

    expect(result.isError).toBe(true);
  });
});
