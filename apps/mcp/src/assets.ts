import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { karakeepClient, mcpServer } from "./shared";
import { toMcpToolError } from "./utils";

export const getAssetInputSchema = {
  assetId: z.string().min(1).describe("The ID of the asset to retrieve."),
};

export async function getAssetHandler({
  assetId,
}: {
  assetId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/assets/{assetId}/signed-url", {
    params: {
      path: {
        assetId,
      },
    },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }

  return {
    content: [
      {
        type: "text",
        text: `Asset ID: ${res.data.assetId}
Signed URL: ${res.data.signedUrl}
Expires at: ${res.data.expiresAt}`,
      },
    ],
  };
}

mcpServer.tool(
  "get-asset",
  "Get a temporary signed URL for downloading an asset by its asset ID.",
  getAssetInputSchema,
  getAssetHandler,
);
