import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockTool } = vi.hoisted(() => ({
  mockClient: {
    GET: vi.fn(),
  },
  mockTool: vi.fn(),
}));

vi.mock("./shared", () => ({
  karakeepClient: mockClient,
  mcpServer: { tool: mockTool },
}));

import { getAssetHandler } from "./assets";

const textOf = (result: CallToolResult): string => {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected text content, got ${JSON.stringify(first)}`);
  }
  return first.text;
};

beforeEach(() => {
  mockClient.GET.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("get-asset", () => {
  it("returns a signed URL and its expiry", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: {
        assetId: "asset_1",
        signedUrl:
          "https://example.com/api/public/assets/asset_1?token=signed-token",
        expiresAt: "2026-01-01T01:00:00.000Z",
      },
      error: undefined,
    });

    const result = await getAssetHandler({ assetId: "asset_1" });

    expect(mockClient.GET).toHaveBeenCalledWith(
      "/assets/{assetId}/signed-url",
      {
        params: {
          path: {
            assetId: "asset_1",
          },
        },
      },
    );
    expect(textOf(result)).toContain("asset_1");
    expect(textOf(result)).toContain(
      "https://example.com/api/public/assets/asset_1?token=signed-token",
    );
    expect(textOf(result)).toContain("2026-01-01T01:00:00.000Z");
  });

  it("returns an MCP error when the asset cannot be accessed", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: {
        code: "NOT_FOUND",
        message: "Asset not found",
      },
    });

    const result = await getAssetHandler({ assetId: "missing" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Asset not found");
  });
});
