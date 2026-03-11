import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { zSortOrder } from "@karakeep/shared/types/bookmarks";
import {
  zCreateTagRequestSchema,
  zTagBasicSchema,
  zTagListQueryParamsSchema,
  zUpdateTagRequestSchema,
} from "@karakeep/shared/types/tags";

import { BearerAuth } from "./common";
import { ErrorSchema, UnauthorizedResponse } from "./errors";
import {
  IncludeContentSearchParamSchema,
  PaginatedBookmarksSchema,
  PaginationSchema,
} from "./pagination";
import { TagSchema } from "./types";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

export const TagIdSchema = registry.registerParameter(
  "TagId",
  z.string().openapi({
    param: {
      name: "tagId",
      in: "path",
    },
    description: "The unique identifier of the tag.",
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  operationId: "listTags",
  method: "get",
  path: "/tags",
  description:
    "Retrieve a paginated list of all tags. Supports filtering by name, attached-by source, and sorting by name, usage count, or relevance.",
  summary: "Get all tags",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: zTagListQueryParamsSchema,
  },
  responses: {
    200: {
      description: "A paginated list of tags with usage counts.",
      content: {
        "application/json": {
          schema: z.object({
            tags: z.array(TagSchema),
            nextCursor: z
              .string()
              .nullable()
              .describe(
                "Cursor for the next page, or null if no more results.",
              ),
          }),
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "createTag",
  method: "post",
  path: "/tags",
  description:
    "Create a new tag. Tag names are normalized (trimmed and converted to the user's preferred tag style).",
  summary: "Create a new tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "The tag name to create.",
      content: {
        "application/json": {
          schema: zCreateTagRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "The created tag.",
      content: {
        "application/json": {
          schema: zTagBasicSchema,
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "getTag",
  method: "get",
  path: "/tags/{tagId}",
  description:
    "Retrieve a single tag by its ID, including the number of bookmarks using it.",
  summary: "Get a single tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ tagId: TagIdSchema }),
  },
  responses: {
    200: {
      description: "The requested tag with usage statistics.",
      content: {
        "application/json": {
          schema: TagSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Tag not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "deleteTag",
  method: "delete",
  path: "/tags/{tagId}",
  description:
    "Delete a tag. This removes the tag from all bookmarks it was attached to.",
  summary: "Delete a tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ tagId: TagIdSchema }),
  },
  responses: {
    204: {
      description: "No content — the tag was deleted successfully.",
    },
    401: UnauthorizedResponse,
    404: {
      description: "Tag not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "updateTag",
  method: "patch",
  path: "/tags/{tagId}",
  description: "Rename a tag. The new name will be normalized and trimmed.",
  summary: "Update a tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ tagId: TagIdSchema }),
    body: {
      description: "The new tag name.",
      content: {
        "application/json": {
          schema: zUpdateTagRequestSchema.omit({ tagId: true }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated tag.",
      content: {
        "application/json": {
          schema: zTagBasicSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Tag not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "getTagBookmarks",
  method: "get",
  path: "/tags/{tagId}/bookmarks",
  description:
    "Retrieve a paginated list of all bookmarks that have the specified tag attached.",
  summary: "Get bookmarks with a tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ tagId: TagIdSchema }),
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
      description: "A paginated list of bookmarks that have the specified tag.",
      content: {
        "application/json": {
          schema: PaginatedBookmarksSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Tag not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
