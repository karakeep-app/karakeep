import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { karakeepClient, mcpServer } from "./shared";
import { toMcpToolError } from "./utils";

mcpServer.tool(
  "get-lists",
  `Retrieves a list of lists.`,
  async (): Promise<CallToolResult> => {
    const res = await karakeepClient.GET("/lists", {
      params: {},
    });
    if (!res.data) {
      return toMcpToolError(res.error);
    }
    return {
      content: [
        {
          type: "text",
          text: res.data.lists
            .map(
              (list) => `List ID: ${list.id}
Name: ${list.name}
Icon: ${list.icon}
Description: ${list.description ?? ""}
Parent ID: ${list.parentId}`,
            )
            .join("\n\n"),
        },
      ],
    };
  },
);

mcpServer.tool(
  "add-bookmark-to-list",
  `Add a bookmark to a list.`,
  {
    listId: z.string().describe(`The listId to add the bookmark to.`),
    bookmarkId: z.string().describe(`The bookmarkId to add.`),
  },
  async ({ listId, bookmarkId }): Promise<CallToolResult> => {
    const res = await karakeepClient.PUT(
      `/lists/{listId}/bookmarks/{bookmarkId}`,
      {
        params: {
          path: {
            listId,
            bookmarkId,
          },
        },
      },
    );
    if (res.error) {
      return toMcpToolError(res.error);
    }
    return {
      content: [
        {
          type: "text",
          text: `Bookmark ${bookmarkId} added to list ${listId}`,
        },
      ],
    };
  },
);

mcpServer.tool(
  "remove-bookmark-from-list",
  `Remove a bookmark from a list.`,
  {
    listId: z.string().describe(`The listId to remove the bookmark from.`),
    bookmarkId: z.string().describe(`The bookmarkId to remove.`),
  },
  async ({ listId, bookmarkId }): Promise<CallToolResult> => {
    const res = await karakeepClient.DELETE(
      `/lists/{listId}/bookmarks/{bookmarkId}`,
      {
        params: {
          path: {
            listId,
            bookmarkId,
          },
        },
      },
    );
    if (res.error) {
      return toMcpToolError(res.error);
    }
    return {
      content: [
        {
          type: "text",
          text: `Bookmark ${bookmarkId} removed from list ${listId}`,
        },
      ],
    };
  },
);

mcpServer.tool(
  "create-list",
  `Create a list.`,
  {
    name: z.string().describe(`The name of the list.`),
    icon: z.string().describe(`The emoji icon of the list.`),
    parentId: z
      .string()
      .optional()
      .describe(`The parent list id of this list.`),
  },
  async ({ name, icon, parentId }): Promise<CallToolResult> => {
    const res = await karakeepClient.POST("/lists", {
      body: {
        name,
        icon,
        parentId,
      },
    });
    if (res.error) {
      return toMcpToolError(res.error);
    }
    return {
      content: [
        {
          type: "text",
          text: `List ${name} created with id ${res.data.id}`,
        },
      ],
    };
  },
);
