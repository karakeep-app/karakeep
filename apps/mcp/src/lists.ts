import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import type { KarakeepAPISchemas } from "@karakeep/sdk";
import {
  zEditBookmarkListSchema,
  zEditBookmarkListSchemaWithValidation,
} from "@karakeep/shared/types/lists";

import { karakeepClient, mcpServer } from "./shared";
import { pickDefined, toMcpToolError } from "./utils";

function formatList(list: KarakeepAPISchemas["List"]): string {
  return `List ID: ${list.id}
Name: ${list.name}
Icon: ${list.icon}
Type: ${list.type}
Description: ${list.description ?? ""}
Parent ID: ${list.parentId ?? ""}
Query: ${list.query ?? ""}
Public: ${list.public}`;
}

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
          text: res.data.lists.map(formatList).join("\n\n"),
        },
      ],
    };
  },
);

export const getListInputSchema = {
  listId: z.string().min(1).describe(`The id of the list to retrieve.`),
};

export async function getListHandler({
  listId,
}: {
  listId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/lists/{listId}", {
    params: { path: { listId } },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return {
    content: [
      {
        type: "text",
        text: formatList(res.data),
      },
    ],
  };
}

mcpServer.tool(
  "get-list",
  `Retrieve a single list by its id.`,
  getListInputSchema,
  getListHandler,
);

const sharedListEditShape = zEditBookmarkListSchema.omit({
  listId: true,
}).shape;

const updateListFields = {
  name: sharedListEditShape.name.describe(`New name for the list.`),
  icon: sharedListEditShape.icon.describe(`New emoji icon for the list.`),
  description: sharedListEditShape.description.describe(
    `New description for the list. Pass null to clear.`,
  ),
  parentId: sharedListEditShape.parentId.describe(
    `New parent list id. Pass null to move to the root.`,
  ),
  query: sharedListEditShape.query.describe(
    `New smart-list query. Only meaningful for smart lists.`,
  ),
  public: sharedListEditShape.public.describe(
    `Whether the list is publicly accessible.`,
  ),
};

export const updateListInputSchema = {
  listId: z.string().min(1).describe(`The id of the list to update.`),
  ...updateListFields,
};

export type UpdateListInput = z.infer<
  z.ZodObject<typeof updateListInputSchema>
>;
type UpdateListBody = Omit<UpdateListInput, "listId">;

export async function updateListHandler(
  input: UpdateListInput,
): Promise<CallToolResult> {
  const refined = zEditBookmarkListSchemaWithValidation.safeParse(input);
  if (!refined.success) {
    const issue = refined.error.issues[0];
    return toMcpToolError(issue?.message ?? "Invalid input for update-list");
  }

  const { listId, ...rest } = input;
  const body: UpdateListBody = pickDefined(rest);

  if (Object.keys(body).length === 0) {
    return toMcpToolError(
      `update-list requires at least one field to update (name, icon, description, parentId, query, or public).`,
    );
  }

  const res = await karakeepClient.PATCH("/lists/{listId}", {
    params: { path: { listId } },
    body,
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return {
    content: [
      {
        type: "text",
        text: `List ${res.data.id} updated.

${formatList(res.data)}`,
      },
    ],
  };
}

mcpServer.tool(
  "update-list",
  `Update a list. Only the fields you pass are changed. Length caps and smart-list query rules come from the shared list schema.`,
  updateListInputSchema,
  updateListHandler,
);

export const deleteListInputSchema = {
  listId: z.string().min(1).describe(`The id of the list to delete.`),
};

export async function deleteListHandler({
  listId,
}: {
  listId: string;
}): Promise<CallToolResult> {
  const getRes = await karakeepClient.GET("/lists/{listId}", {
    params: { path: { listId } },
  });
  if (!getRes.data) {
    return toMcpToolError(getRes.error);
  }
  const { id, name } = getRes.data;

  const delRes = await karakeepClient.DELETE("/lists/{listId}", {
    params: { path: { listId: id } },
  });
  if (delRes.error) {
    return toMcpToolError(delRes.error);
  }
  return {
    content: [
      {
        type: "text",
        text: `Deleted list "${name}" (id: ${id}).`,
      },
    ],
  };
}

mcpServer.tool(
  "delete-list",
  `Delete a list by id. Bookmarks inside the list are not deleted. Child lists are NOT deleted either — they keep their parentId pointing at this list and become orphaned in the tree. Move or re-parent child lists first if that matters.`,
  deleteListInputSchema,
  deleteListHandler,
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
    if (!res.data) {
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
