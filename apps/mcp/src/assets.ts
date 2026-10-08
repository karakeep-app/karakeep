import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import { karakeepClient, registerTool } from "./shared";
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

registerTool(
  "get-asset",
  {
    description:
      "Get a temporary signed URL for downloading an asset by its asset ID.",
    inputSchema: z.object(getAssetInputSchema),
  },
  getAssetHandler,
);
