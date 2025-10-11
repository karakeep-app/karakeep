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
import { ErrorSchema } from "./errors";
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
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  method: "get",
  path: "/tags",
  description: "Get all tags",
  summary: "Get all tags",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: zTagListQueryParamsSchema,
  },
  responses: {
    200: {
      description: "Object with all tags data.",
      content: {
        "application/json": {
          schema: z.object({
            tags: z.array(TagSchema),
            nextCursor: z.string().nullable(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/tags",
  description: "Create a new tag",
  summary: "Create a new tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "The data to create the tag with.",
      content: {
        "application/json": {
          schema: zCreateTagRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "The created tag",
      content: {
        "application/json": {
          schema: zTagBasicSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/tags/{tagId}",
  description: "Get tag by its id",
  summary: "Get a single tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ tagId: TagIdSchema }),
  },
  responses: {
    200: {
      description: "Object with list data.",
      content: {
        "application/json": {
          schema: TagSchema,
        },
      },
    },
    404: {
      description: "Tag not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/tags/{tagId}",
  description: "Delete tag by its id",
  summary: "Delete a tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ tagId: TagIdSchema }),
  },
  responses: {
    204: {
      description: "No content - the bookmark was deleted",
    },
    404: {
      description: "Tag not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/tags/{tagId}",
  description: "Update tag by its id",
  summary: "Update a tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ tagId: TagIdSchema }),
    body: {
      description:
        "The data to update. Only the fields you want to update need to be provided.",
      content: {
        "application/json": {
          schema: zUpdateTagRequestSchema.omit({ tagId: true }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated tag",
      content: {
        "application/json": {
          schema: zTagBasicSchema,
        },
      },
    },
    404: {
      description: "Tag not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/tags/{tagId}/bookmarks",
  description: "Get bookmarks with the tag",
  summary: "Get bookmarks with the tag",
  tags: ["Tags"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ tagId: TagIdSchema }),
    query: z
      .object({
        sortOrder: zSortOrder
          .exclude(["relevance"])
          .optional()
          .default(zSortOrder.Enum.desc),
      })
      .merge(PaginationSchema)
      .merge(IncludeContentSearchParamSchema),
  },
  responses: {
    200: {
      description: "Object with list data.",
      content: {
        "application/json": {
          schema: PaginatedBookmarksSchema,
        },
      },
    },
    404: {
      description: "Tag not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
