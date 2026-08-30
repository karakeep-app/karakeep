import type { CallToolResult } from "@modelcontextprotocol/server";
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
  registerTool: mockTool,
}));

import {
  deleteListHandler,
  getListBookmarksHandler,
  getListHandler,
  updateListHandler,
} from "./lists";

const textOf = (result: CallToolResult): string => {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected text content, got ${JSON.stringify(first)}`);
  }
  return first.text;
};

const sampleList = {
  id: "list_123",
  name: "Reading",
  icon: "📚",
  type: "manual" as const,
  description: "Saved articles",
  parentId: null,
  query: null,
  public: false,
  hasCollaborators: false,
  userRole: "owner" as const,
};

const sampleBookmark = {
  id: "bookmark_1",
  createdAt: "2026-01-01T00:00:00Z",
  modifiedAt: null,
  title: "Sample",
  archived: false,
  favourited: true,
  taggingStatus: "success" as const,
  summarizationStatus: null,
  embeddingStatus: null,
  note: null,
  summary: null,
  source: "api" as const,
  userId: "user_1",
  tags: [],
  content: {
    type: "text" as const,
    text: "Saved text",
    sourceUrl: null,
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

describe("get-list", () => {
  it("returns formatted list details on success", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: sampleList,
      error: undefined,
    });

    const result = await getListHandler({ listId: "list_123" });

    expect(mockClient.GET).toHaveBeenCalledWith("/lists/{listId}", {
      params: { path: { listId: "list_123" } },
    });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("List ID: list_123");
    expect(text).toContain("Name: Reading");
    expect(text).toContain("Type: manual");
    expect(text).toContain("Public: false");
  });

  it("returns an MCP error when the list is not found", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "List not found" },
    });

    const result = await getListHandler({ listId: "missing" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("NOT_FOUND");
  });
});

describe("get-list-bookmarks", () => {
  it("uses the stable list id and forwards pagination options", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { bookmarks: [sampleBookmark], nextCursor: "next_page" },
      error: undefined,
    });

    const result = await getListBookmarksHandler({
      listId: "list_123",
      sortOrder: "asc",
      limit: 10,
      includeContent: true,
    });

    expect(mockClient.GET).toHaveBeenCalledWith("/lists/{listId}/bookmarks", {
      params: {
        path: { listId: "list_123" },
        query: { sortOrder: "asc", limit: 10, includeContent: true },
      },
    });
    const text = textOf(result);
    expect(text).toContain("Bookmark ID: bookmark_1");
    expect(text).toContain("Text: Saved text");
    expect(text).toContain("Next page cursor: next_page");
  });

  it("surfaces a missing-list error", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "List not found" },
    });

    const result = await getListBookmarksHandler({ listId: "missing" });

    expect(result.isError).toBe(true);
  });
});

describe("update-list", () => {
  it("sends only the provided fields and returns the updated list", async () => {
    const updated = { ...sampleList, name: "Reading list", icon: "📖" };
    mockClient.PATCH.mockResolvedValueOnce({ data: updated, error: undefined });

    const result = await updateListHandler({
      listId: "list_123",
      name: "Reading list",
      icon: "📖",
    });

    expect(mockClient.PATCH).toHaveBeenCalledWith("/lists/{listId}", {
      params: { path: { listId: "list_123" } },
      body: { name: "Reading list", icon: "📖" },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("List list_123 updated.");
  });

  it("preserves explicit nulls for nullable fields like parentId", async () => {
    mockClient.PATCH.mockResolvedValueOnce({
      data: sampleList,
      error: undefined,
    });

    await updateListHandler({ listId: "list_123", parentId: null });

    expect(mockClient.PATCH).toHaveBeenCalledWith("/lists/{listId}", {
      params: { path: { listId: "list_123" } },
      body: { parentId: null },
    });
  });

  it("rejects calls with no updatable fields", async () => {
    const result = await updateListHandler({ listId: "list_123" });

    expect(mockClient.PATCH).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/requires at least one field/i);
  });

  it("rejects a list trying to parent itself (shared refinement)", async () => {
    const result = await updateListHandler({
      listId: "list_123",
      parentId: "list_123",
    });

    expect(mockClient.PATCH).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/can't be its own parent/i);
  });

  it("rejects an invalid smart-list query (shared refinement)", async () => {
    const result = await updateListHandler({
      listId: "list_123",
      query: "not a valid #search query at all",
    });

    expect(mockClient.PATCH).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it("returns an MCP error when the list is not found", async () => {
    mockClient.PATCH.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "List not found" },
    });

    const result = await updateListHandler({
      listId: "missing",
      name: "x",
    });

    expect(result.isError).toBe(true);
  });
});

describe("delete-list", () => {
  it("fetches the list, deletes it, and returns name + id", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: sampleList,
      error: undefined,
    });
    mockClient.DELETE.mockResolvedValueOnce({
      data: undefined,
      error: undefined,
    });

    const result = await deleteListHandler({ listId: "list_123" });

    expect(mockClient.GET).toHaveBeenCalledWith("/lists/{listId}", {
      params: { path: { listId: "list_123" } },
    });
    expect(mockClient.DELETE).toHaveBeenCalledWith("/lists/{listId}", {
      params: { path: { listId: "list_123" } },
    });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("Reading");
    expect(text).toContain("list_123");
  });

  it("returns an MCP error and does not call DELETE when the list is not found", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { code: "NOT_FOUND", message: "List not found" },
    });

    const result = await deleteListHandler({ listId: "missing" });

    expect(mockClient.DELETE).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it("returns an MCP error when DELETE itself fails", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: sampleList,
      error: undefined,
    });
    mockClient.DELETE.mockResolvedValueOnce({
      data: undefined,
      error: { code: "INTERNAL", message: "boom" },
    });

    const result = await deleteListHandler({ listId: "list_123" });

    expect(result.isError).toBe(true);
  });
});
