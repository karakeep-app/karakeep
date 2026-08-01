import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { karakeepClient, mcpServer } from "./shared";
import {
  compactBookmark,
  compactTag,
  pickDefined,
  toMcpToolError,
} from "./utils";

mcpServer.tool(
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
        tags: tagsToAttach.map((tag: string) => ({ tagName: tag })),
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

mcpServer.tool(
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
        tags: tagsToDetach.map((tag: string) => ({ tagName: tag })),
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

export const getTagsInputSchema = {
  nameContains: z
    .string()
    .min(1)
    .optional()
    .describe(`Filter tags whose name contains this substring.`),
  sort: z
    .enum(["name", "usage", "relevance"])
    .optional()
    .describe(
      `Sort order. 'relevance' requires nameContains. Defaults to 'usage'.`,
    ),
  attachedBy: z
    .enum(["ai", "human", "none"])
    .optional()
    .describe(`Filter by how the tag was attached.`),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe(`Cursor from a previous response to fetch the next page.`),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`Maximum number of items to return per page.`),
};

export type GetTagsInput = z.infer<z.ZodObject<typeof getTagsInputSchema>>;

export async function getTagsHandler(
  input: GetTagsInput,
): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/tags", {
    params: { query: pickDefined(input) },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  const cursorLine = res.data.nextCursor
    ? `\n\nNext page cursor: ${res.data.nextCursor}`
    : "";
  return {
    content: [
      {
        type: "text",
        text: res.data.tags.map(compactTag).join("\n\n") + cursorLine,
      },
    ],
  };
}

mcpServer.tool(
  "get-tags",
  `List tags with their bookmark counts. Supports filtering and pagination.`,
  getTagsInputSchema,
  getTagsHandler,
);

export const getTagInputSchema = {
  tagId: z.string().min(1).describe(`The id of the tag to retrieve.`),
};

export async function getTagHandler({
  tagId,
}: {
  tagId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/tags/{tagId}", {
    params: { path: { tagId } },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return {
    content: [{ type: "text", text: compactTag(res.data) }],
  };
}

mcpServer.tool(
  "get-tag",
  `Retrieve a single tag by id, including its bookmark counts.`,
  getTagInputSchema,
  getTagHandler,
);

export const updateTagInputSchema = {
  tagId: z.string().min(1).describe(`The id of the tag to update.`),
  name: z
    .string()
    .min(1)
    .describe(`New name for the tag. Will be normalized by the server.`),
};

export type UpdateTagInput = z.infer<z.ZodObject<typeof updateTagInputSchema>>;

export async function updateTagHandler(
  input: UpdateTagInput,
): Promise<CallToolResult> {
  const { tagId, name } = input;
  const res = await karakeepClient.PATCH("/tags/{tagId}", {
    params: { path: { tagId } },
    body: { name },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return {
    content: [
      {
        type: "text",
        text: `Tag ${res.data.id} renamed to "${res.data.name}".`,
      },
    ],
  };
}

mcpServer.tool(
  "update-tag",
  `Rename a tag. The new name is normalized by the server.`,
  updateTagInputSchema,
  updateTagHandler,
);

export const deleteTagInputSchema = {
  tagId: z.string().min(1).describe(`The id of the tag to delete.`),
};

export async function deleteTagHandler({
  tagId,
}: {
  tagId: string;
}): Promise<CallToolResult> {
  const getRes = await karakeepClient.GET("/tags/{tagId}", {
    params: { path: { tagId } },
  });
  if (!getRes.data) {
    return toMcpToolError(getRes.error);
  }
  const { id, name } = getRes.data;

  const delRes = await karakeepClient.DELETE("/tags/{tagId}", {
    params: { path: { tagId: id } },
  });
  if (delRes.error) {
    return toMcpToolError(delRes.error);
  }
  return {
    content: [
      {
        type: "text",
        text: `Deleted tag "${name}" (id: ${id}). Bookmarks previously tagged are not deleted.`,
      },
    ],
  };
}

mcpServer.tool(
  "delete-tag",
  `Delete a tag by id. Bookmarks that had this tag are not deleted; the tag is just removed from them.`,
  deleteTagInputSchema,
  deleteTagHandler,
);

export const getTagBookmarksInputSchema = {
  tagId: z
    .string()
    .min(1)
    .describe(`The id of the tag whose bookmarks to fetch.`),
  sortOrder: z
    .enum(["asc", "desc"])
    .optional()
    .describe(`Sort order by creation date. Defaults to 'desc'.`),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`Maximum number of bookmarks to return per page.`),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe(`Cursor from a previous response to fetch the next page.`),
  includeContent: z
    .boolean()
    .optional()
    .describe(
      `If true, include each bookmark's full content. Defaults to false.`,
    ),
};

export type GetTagBookmarksInput = z.infer<
  z.ZodObject<typeof getTagBookmarksInputSchema>
>;

export async function getTagBookmarksHandler(
  input: GetTagBookmarksInput,
): Promise<CallToolResult> {
  const { tagId, includeContent, ...query } = input;
  const res = await karakeepClient.GET("/tags/{tagId}/bookmarks", {
    params: {
      path: { tagId },
      query: pickDefined({ ...query, includeContent }),
    },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  const cursorLine = res.data.nextCursor
    ? `\n\nNext page cursor: ${res.data.nextCursor}`
    : "";
  return {
    content: [
      {
        type: "text",
        text:
          res.data.bookmarks
            .map((bm) => compactBookmark(bm, { includeContent }))
            .join("\n\n") + cursorLine,
      },
    ],
  };
}

mcpServer.tool(
  "get-tag-bookmarks",
  `List bookmarks that have a given tag, with pagination.`,
  getTagBookmarksInputSchema,
  getTagBookmarksHandler,
);
