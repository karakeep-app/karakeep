import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
  zAssetSchema,
  zAssetTypesSchema,
  zBareBookmarkSchema,
  zManipulatedTagSchema,
  zNewBookmarkRequestSchema,
  zSortOrder,
  zUpdateBookmarksRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { AssetIdSchema } from "./assets";
import { BearerAuth } from "./common";
import { ErrorSchema } from "./errors";
import {
  BookmarkSchema,
  IncludeContentSearchParamSchema,
  PaginatedBookmarksSchema,
  PaginationSchema,
} from "./pagination";
import { TagIdSchema } from "./tags";
import { HighlightSchema, ListSchema } from "./types";

export const registry = new OpenAPIRegistry();
extendZodWithOpenApi(z);

export const BookmarkIdSchema = registry.registerParameter(
  "BookmarkId",
  z.string().openapi({
    param: {
      name: "bookmarkId",
      in: "path",
    },
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  method: "get",
  path: "/bookmarks",
  description: "Get all bookmarks",
  summary: "Get all bookmarks",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: z
      .object({
        archived: z.boolean().optional(),
        favourited: z.boolean().optional(),
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
      description: "Object with all bookmarks data.",
      content: {
        "application/json": {
          schema: PaginatedBookmarksSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/bookmarks/search",
  description: "Search bookmarks",
  summary: "Search bookmarks",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: z
      .object({
        q: z.string(),
        sortOrder: zSortOrder.optional().default(zSortOrder.Enum.relevance),
      })
      .merge(PaginationSchema)
      .merge(IncludeContentSearchParamSchema),
  },
  responses: {
    200: {
      description: "Object with the search results.",
      content: {
        "application/json": {
          schema: PaginatedBookmarksSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/bookmarks/check-url",
  description:
    "Check if a URL is already bookmarked. Uses substring matching to find candidates, then normalizes URLs (ignoring hash fragments and trailing slashes) for exact comparison.",
  summary: "Check if a URL exists in bookmarks",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: z.object({
      url: z.string(),
    }),
  },
  responses: {
    200: {
      description:
        "Object indicating whether the URL is bookmarked. bookmarkId is null if not found.",
      content: {
        "application/json": {
          schema: z.object({
            bookmarkId: z.string().nullable(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/bookmarks",
  description: "Create a new bookmark",
  summary: "Create a new bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "The bookmark to create",
      content: {
        "application/json": {
          schema: zNewBookmarkRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "The bookmark already exists",
      content: {
        "application/json": {
          schema: BookmarkSchema,
        },
      },
    },
    201: {
      description: "The bookmark got created",
      content: {
        "application/json": {
          schema: BookmarkSchema,
        },
      },
    },
    400: {
      description: "Bad request",
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
  path: "/bookmarks/{bookmarkId}",
  description: "Get bookmark by its id",
  summary: "Get a single bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    query: IncludeContentSearchParamSchema,
  },
  responses: {
    200: {
      description: "Object with bookmark data.",
      content: {
        "application/json": {
          schema: BookmarkSchema,
        },
      },
    },
    404: {
      description: "Bookmark not found",
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
  path: "/bookmarks/{bookmarkId}",
  description: "Delete bookmark by its id",
  summary: "Delete a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    204: {
      description: "No content - the bookmark was deleted",
    },
    404: {
      description: "Bookmark not found",
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
  path: "/bookmarks/{bookmarkId}",
  description: "Update bookmark by its id",
  summary: "Update a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    body: {
      description:
        "The data to update. Only the fields you want to update need to be provided.",
      content: {
        "application/json": {
          schema: zUpdateBookmarksRequestSchema.omit({ bookmarkId: true }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated bookmark",
      content: {
        "application/json": {
          schema: zBareBookmarkSchema,
        },
      },
    },
    404: {
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/bookmarks/{bookmarkId}/summarize",
  description:
    "Attaches a summary to the bookmark and returns the updated record.",
  summary: "Summarize a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    200: {
      description: "The updated bookmark with summary",
      content: {
        "application/json": {
          schema: zBareBookmarkSchema,
        },
      },
    },
    404: {
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/bookmarks/{bookmarkId}/tags",
  description: "Attach tags to a bookmark",
  summary: "Attach tags to a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    body: {
      description: "The tags to attach.",
      content: {
        "application/json": {
          schema: z.object({ tags: z.array(zManipulatedTagSchema) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The list of attached tag ids",
      content: {
        "application/json": {
          schema: z.object({ attached: z.array(TagIdSchema) }),
        },
      },
    },
    404: {
      description: "Bookmark not found",
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
  path: "/bookmarks/{bookmarkId}/tags",
  description: "Detach tags from a bookmark",
  summary: "Detach tags from a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    body: {
      description: "The tags to detach.",
      content: {
        "application/json": {
          schema: z.object({ tags: z.array(zManipulatedTagSchema) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The list of detached tag ids",
      content: {
        "application/json": {
          schema: z.object({ detached: z.array(TagIdSchema) }),
        },
      },
    },
    404: {
      description: "Bookmark not found",
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
  path: "/bookmarks/{bookmarkId}/lists",
  description: "Get lists of a bookmark",
  summary: "Get lists of a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    200: {
      description: "The list of highlights",
      content: {
        "application/json": {
          schema: z.object({ lists: z.array(ListSchema) }),
        },
      },
    },
    404: {
      description: "Bookmark not found",
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
  path: "/bookmarks/{bookmarkId}/highlights",
  description: "Get highlights of a bookmark",
  summary: "Get highlights of a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    200: {
      description: "The list of highlights",
      content: {
        "application/json": {
          schema: z.object({ highlights: z.array(HighlightSchema) }),
        },
      },
    },
    404: {
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/bookmarks/{bookmarkId}/assets",
  description: "Attach a new asset to a bookmark",
  summary: "Attach asset",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    body: {
      description: "The asset to attach",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            assetType: zAssetTypesSchema,
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "The attached asset",
      content: {
        "application/json": {
          schema: zAssetSchema,
        },
      },
    },
    404: {
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "put",
  path: "/bookmarks/{bookmarkId}/assets/{assetId}",
  description: "Replace an existing asset with a new one",
  summary: "Replace asset",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({
      bookmarkId: BookmarkIdSchema,
      assetId: AssetIdSchema,
    }),
    body: {
      description: "The new asset to replace with",
      content: {
        "application/json": {
          schema: z.object({
            assetId: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    204: {
      description: "No content - asset was replaced successfully",
    },
    404: {
      description: "Bookmark not found",
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
  path: "/bookmarks/{bookmarkId}/assets/{assetId}",
  description: "Detach an asset from a bookmark",
  summary: "Detach asset",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({
      bookmarkId: BookmarkIdSchema,
      assetId: AssetIdSchema,
    }),
  },
  responses: {
    204: {
      description: "No content - asset was detached successfully",
    },
    404: {
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
