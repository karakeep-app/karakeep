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

import { deleteListHandler, getListHandler, updateListHandler } from "./lists";

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

beforeEach(() => {
  mockClient.GET.mockReset();
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
    const text = (result.content[0] as { type: "text"; text: string }).text;
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
    expect(
      (result.content[0] as { type: "text"; text: string }).text,
    ).toContain("NOT_FOUND");
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
    expect(
      (result.content[0] as { type: "text"; text: string }).text,
    ).toContain("List list_123 updated.");
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
    expect((result.content[0] as { type: "text"; text: string }).text).toMatch(
      /requires at least one field/i,
    );
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
    const text = (result.content[0] as { type: "text"; text: string }).text;
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
