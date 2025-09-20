import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { karakeepClient } from "./shared";
import { toMcpToolError } from "./utils";

export function registerTagTools(server: McpServer) {
  server.tool(
    "attach-tag-to-bookmark",
    `Attach a tag to a bookmark.`,
    {
      bookmarkId: z.string().describe(`The bookmarkId to attach the tag to.`),
      tagsToAttach: z.array(z.string()).describe(`The tag names to attach.`),
    },
    async ({ bookmarkId, tagsToAttach }): Promise<CallToolResult> => {
      const res = await karakeepClient.POST(`/bookmarks/{bookmarkId}/tags`, {
        params: {
          path: {
            bookmarkId,
          },
        },
        body: {
          tags: tagsToAttach.map((tag) => ({ tagName: tag })),
        },
      });
      if (res.error) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: `Tags ${JSON.stringify(tagsToAttach)} attached to bookmark ${bookmarkId}`,
          },
        ],
      };
    },
  );

  server.tool(
    "detach-tag-from-bookmark",
    `Detach a tag from a bookmark.`,
    {
      bookmarkId: z.string().describe(`The bookmarkId to detach the tag from.`),
      tagsToDetach: z.array(z.string()).describe(`The tag names to detach.`),
    },
    async ({ bookmarkId, tagsToDetach }): Promise<CallToolResult> => {
      const res = await karakeepClient.DELETE(`/bookmarks/{bookmarkId}/tags`, {
        params: {
          path: {
            bookmarkId,
          },
        },
        body: {
          tags: tagsToDetach.map((tag) => ({ tagName: tag })),
        },
      });
      if (res.error) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: `Tags ${JSON.stringify(tagsToDetach)} detached from bookmark ${bookmarkId}`,
          },
        ],
      };
    },
  );
}
