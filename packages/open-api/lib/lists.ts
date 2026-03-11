import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { zSortOrder } from "@karakeep/shared/types/bookmarks";
import {
  zEditBookmarkListSchema,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";

import { BookmarkIdSchema } from "./bookmarks";
import { BearerAuth } from "./common";
import { ErrorSchema, UnauthorizedResponse } from "./errors";
import {
  IncludeContentSearchParamSchema,
  PaginatedBookmarksSchema,
  PaginationSchema,
} from "./pagination";
import { ListSchema } from "./types";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

export const ListIdSchema = registry.registerParameter(
  "ListId",
  z.string().openapi({
    param: {
      name: "listId",
      in: "path",
    },
    description: "The unique identifier of the list.",
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  operationId: "listLists",
  method: "get",
  path: "/lists",
  description:
    "Retrieve all bookmark lists for the authenticated user, including both manual and smart lists.",
  summary: "Get all lists",
  tags: ["Lists"],
  security: [{ [BearerAuth.name]: [] }],
  request: {},
  responses: {
    200: {
      description: "All lists owned by or shared with the current user.",
      content: {
        "application/json": {
          schema: z.object({
            lists: z.array(ListSchema),
          }),
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "createList",
  method: "post",
  path: "/lists",
  description:
    "Create a new bookmark list. Lists can be manual (bookmarks are added explicitly) or smart (bookmarks are matched automatically by a search query).",
  summary: "Create a new list",
  tags: ["Lists"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description:
        "The list to create. For smart lists, a `query` field is required. For manual lists, `query` must not be set.",
      content: {
        "application/json": {
          schema: zNewBookmarkListSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "The created list.",
      content: {
        "application/json": {
          schema: ListSchema,
        },
      },
    },
    400: {
      description:
        "Bad request — invalid input data (e.g., smart list missing query, or manual list with a query).",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "getList",
  method: "get",
  path: "/lists/{listId}",
  description: "Retrieve a single list by its ID.",
  summary: "Get a single list",
  tags: ["Lists"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ listId: ListIdSchema }),
  },
  responses: {
    200: {
      description: "The requested list.",
      content: {
        "application/json": {
          schema: ListSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "List not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "deleteList",
  method: "delete",
  path: "/lists/{listId}",
  description:
    "Delete a list. This removes the list only — bookmarks within it are not deleted.",
  summary: "Delete a list",
  tags: ["Lists"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ listId: ListIdSchema }),
  },
  responses: {
    204: {
      description: "No content — the list was deleted successfully.",
    },
    401: UnauthorizedResponse,
    404: {
      description: "List not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "updateList",
  method: "patch",
  path: "/lists/{listId}",
  description:
    "Partially update a list. Only the fields provided in the request body will be updated.",
  summary: "Update a list",
  tags: ["Lists"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ listId: ListIdSchema }),
    body: {
      description:
        "The fields to update. Only the fields you want to change need to be provided.",
      content: {
        "application/json": {
          schema: zEditBookmarkListSchema.omit({ listId: true }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated list.",
      content: {
        "application/json": {
          schema: ListSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "List not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "getListBookmarks",
  method: "get",
  path: "/lists/{listId}/bookmarks",
  description:
    "Retrieve a paginated list of bookmarks within the specified list. For smart lists, bookmarks are computed from the list's query.",
  summary: "Get bookmarks in a list",
  tags: ["Lists"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ listId: ListIdSchema }),
    query: z
      .object({
        sortOrder: zSortOrder
          .exclude(["relevance"])
          .optional()
          .default(zSortOrder.Enum.desc)
          .describe("Sort order by creation date. Defaults to 'desc'."),
      })
      .merge(PaginationSchema)
      .merge(IncludeContentSearchParamSchema),
  },
  responses: {
    200: {
      description: "A paginated list of bookmarks in the specified list.",
      content: {
        "application/json": {
          schema: PaginatedBookmarksSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "List not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "addBookmarkToList",
  method: "put",
  path: "/lists/{listId}/bookmarks/{bookmarkId}",
  description:
    "Add a bookmark to a manual list. This operation is idempotent — adding an already-present bookmark has no effect.",
  summary: "Add a bookmark to a list",
  tags: ["Lists"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ listId: ListIdSchema, bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    204: {
      description:
        "No content — the bookmark was added to the list successfully.",
    },
    401: UnauthorizedResponse,
    404: {
      description: "List or bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "removeBookmarkFromList",
  method: "delete",
  path: "/lists/{listId}/bookmarks/{bookmarkId}",
  description: "Remove a bookmark from a manual list.",
  summary: "Remove a bookmark from a list",
  tags: ["Lists"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ listId: ListIdSchema, bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    204: {
      description:
        "No content — the bookmark was removed from the list successfully.",
    },
    400: {
      description: "Bookmark is not in the list.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "List or bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
