import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import * as z from "zod";

import {
  BookmarkTypes,
  DEFAULT_READABLE_CONTENT_MAX_CHARS,
  MAX_READABLE_CONTENT_MAX_CHARS,
  zAssetSchema,
  zAssetTypesSchema,
  zBareBookmarkSchema,
  zBookmarkReadableContentFormatSchema,
  zBookmarkSearchMode,
  zManipulatedTagSchema,
  zNewBookmarkRequestSchema,
  zSortOrder,
  zUpdateBookmarksRequestSchema,
} from "@karakeep/shared/types/bookmarks";

import { AssetIdSchema } from "./assets";
import { BearerAuth } from "./common";
import { ErrorSchema, UnauthorizedResponse } from "./errors";
import {
  BookmarkSchema,
  IncludeContentSearchParamSchema,
  PaginatedBookmarksSchema,
  PaginationSchema,
} from "./pagination";
import { TagIdSchema } from "./tags";
import { HighlightSchema, ListSchema } from "./types";

export const registry = new OpenAPIRegistry();

export const BookmarkIdSchema = registry.registerParameter(
  "BookmarkId",
  z.string().openapi({
    param: {
      name: "bookmarkId",
      in: "path",
    },
    description: "The unique identifier of the bookmark.",
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

registry.registerPath({
  operationId: "listBookmarks",
  method: "get",
  path: "/bookmarks",
  description:
    "Retrieve a paginated list of all bookmarks for the authenticated user. " +
    "Supports filtering by archived/favourited status and sorting by last saved date.",
  summary: "Get all bookmarks",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: z
      .object({
        archived: z.boolean().optional().describe("Filter by archived status."),
        favourited: z
          .boolean()
          .optional()
          .describe("Filter by favourited status."),
        sortOrder: zSortOrder
          .exclude(["relevance"])
          .optional()
          .default(zSortOrder.enum.desc)
          .describe("Sort order by last saved date. Defaults to 'desc'."),
      })
      .extend(PaginationSchema.shape)
      .extend(IncludeContentSearchParamSchema.shape),
  },
  responses: {
    200: {
      description: "A paginated list of bookmarks.",
      content: {
        "application/json": {
          schema: PaginatedBookmarksSchema,
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "searchBookmarks",
  method: "get",
  path: "/bookmarks/search",
  description:
    "Search across all bookmarks using full-text, semantic, or hybrid ranking. Full-text search covers bookmark titles, content, descriptions, and notes. " +
    "Results default to full-text relevance sorting; semantic and hybrid modes support relevance sorting only.",
  summary: "Search bookmarks",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: z
      .object({
        q: z.string().describe("The search query string."),
        searchMode: zBookmarkSearchMode
          .optional()
          .default("fts")
          .describe(
            "Search strategy. 'fts' uses full-text search, 'semantic' uses bookmark embeddings, and 'hybrid' fuses a fixed candidate window from both. Hybrid falls back to full-text search when the query contains no free-text terms or when embedding infrastructure is unavailable. Semantic hits below a minimum similarity are dropped, so semantic search may return fewer results than requested.",
          ),
        sortOrder: zSortOrder
          .optional()
          .default(zSortOrder.enum.relevance)
          .describe(
            "Sort order for results. Defaults to 'relevance'. Use 'asc' or 'desc' to sort by last saved date.",
          ),
      })
      .extend(PaginationSchema.shape)
      .extend(IncludeContentSearchParamSchema.shape),
  },
  responses: {
    200: {
      description: "A paginated list of bookmarks matching the search query.",
      content: {
        "application/json": {
          schema: PaginatedBookmarksSchema,
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "checkBookmarkUrl",
  method: "get",
  path: "/bookmarks/check-url",
  description:
    "Check if a URL is already bookmarked. Uses substring matching to find candidates, then normalizes URLs (ignoring hash fragments and trailing slashes) for exact comparison.",
  summary: "Check if a URL exists in bookmarks",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    query: z.object({
      url: z.string().describe("The URL to check against existing bookmarks."),
    }),
  },
  responses: {
    200: {
      description:
        "Object indicating whether the URL is bookmarked. `bookmarkId` is `null` if not found.",
      content: {
        "application/json": {
          schema: z.object({
            bookmarkId: z
              .string()
              .nullable()
              .describe(
                "The ID of the existing bookmark, or null if the URL is not bookmarked.",
              ),
          }),
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "createBookmark",
  method: "post",
  path: "/bookmarks",
  description:
    "Create a new bookmark. The bookmark type (link, text, or asset) is determined by the `type` field in the request body. " +
    "For link bookmarks, if the URL already exists, user-initiated saves unarchive it and move it to the top of chronological views; import and RSS duplicates leave it unchanged. The existing bookmark is returned with a 200 status.",
  summary: "Create a new bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    body: {
      description: "The bookmark to create.",
      content: {
        "application/json": {
          schema: zNewBookmarkRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description:
        "A bookmark with this URL already exists. User-initiated saves refresh and unarchive it; import and RSS duplicates leave it unchanged.",
      content: {
        "application/json": {
          schema: BookmarkSchema,
        },
      },
    },
    201: {
      description: "The bookmark was created successfully.",
      content: {
        "application/json": {
          schema: BookmarkSchema,
        },
      },
    },
    400: {
      description: "Bad request — invalid input data.",
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
  operationId: "getBookmark",
  method: "get",
  path: "/bookmarks/{bookmarkId}",
  description:
    "Retrieve a single bookmark by its ID, including its tags, content, and assets.",
  summary: "Get a single bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    query: IncludeContentSearchParamSchema,
  },
  responses: {
    200: {
      description: "The requested bookmark.",
      content: {
        "application/json": {
          schema: BookmarkSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "getBookmarkReadableContent",
  method: "get",
  path: "/bookmarks/{bookmarkId}/content",
  description:
    "Retrieve a bounded chunk of an agent-readable bookmark representation. " +
    "Link content is rendered from extracted HTML; text and media bookmarks use their stored or extracted text. " +
    "Continue reading by passing the opaque `nextCursor` from the previous response.",
  summary: "Get readable bookmark content",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    query: z.object({
      format: zBookmarkReadableContentFormatSchema
        .optional()
        .describe(
          "The readable representation. If omitted with a cursor, the cursor's format is used; otherwise defaults to markdown.",
        ),
      maxChars: z
        .number()
        .int()
        .min(1)
        .max(MAX_READABLE_CONTENT_MAX_CHARS)
        .optional()
        .default(DEFAULT_READABLE_CONTENT_MAX_CHARS)
        .describe(
          "Maximum number of Unicode characters to return. The chunk may end earlier at a paragraph or line boundary.",
        ),
      cursor: z
        .string()
        .optional()
        .describe(
          "Opaque continuation cursor returned as `nextCursor` by a previous response.",
        ),
    }),
  },
  responses: {
    200: {
      description: "A bounded chunk of readable bookmark content.",
      content: {
        "application/json": {
          schema: z
            .object({
              bookmarkId: z.string(),
              bookmarkType: z.enum([
                BookmarkTypes.LINK,
                BookmarkTypes.TEXT,
                BookmarkTypes.ASSET,
              ]),
              format: zBookmarkReadableContentFormatSchema,
              content: z.string(),
              contentVersion: z
                .string()
                .describe(
                  "A hash identifying the rendered content version used by this cursor.",
                ),
              range: z.object({
                start: z
                  .number()
                  .int()
                  .describe(
                    "Zero-based start offset in Unicode characters, inclusive.",
                  ),
                end: z
                  .number()
                  .int()
                  .describe(
                    "Zero-based end offset in Unicode characters, exclusive.",
                  ),
                total: z
                  .number()
                  .int()
                  .describe(
                    "Total number of Unicode characters in the rendered content.",
                  ),
              }),
              nextCursor: z
                .string()
                .nullable()
                .describe(
                  "Cursor for the next chunk, or null when all content has been returned.",
                ),
              truncated: z
                .boolean()
                .describe(
                  "Whether more readable content remains after this chunk.",
                ),
            })
            .openapi("BookmarkReadableContent"),
        },
      },
    },
    400: {
      description:
        "Bad request — the cursor is malformed, mismatched, or outside the content.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    409: {
      description:
        "The bookmark content changed after the supplied cursor was issued.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "deleteBookmark",
  method: "delete",
  path: "/bookmarks/{bookmarkId}",
  description:
    "Permanently delete a bookmark and all its associated data (tags, highlights, assets).",
  summary: "Delete a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    204: {
      description: "No content — the bookmark was deleted successfully.",
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "updateBookmark",
  method: "patch",
  path: "/bookmarks/{bookmarkId}",
  description:
    "Partially update a bookmark. Only the fields provided in the request body will be updated. " +
    "Supports updating common fields (title, note, archived, favourited) as well as type-specific fields.",
  summary: "Update a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    body: {
      description:
        "The fields to update. Only the fields you want to change need to be provided.",
      content: {
        "application/json": {
          schema: zUpdateBookmarksRequestSchema.omit({ bookmarkId: true }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated bookmark.",
      content: {
        "application/json": {
          schema: zBareBookmarkSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "summarizeBookmark",
  method: "post",
  path: "/bookmarks/{bookmarkId}/summarize",
  description:
    "Trigger AI summarization for a bookmark. The summary is generated asynchronously and attached to the bookmark. " +
    "Returns the updated bookmark record.",
  summary: "Summarize a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    200: {
      description: "The bookmark with the updated summary.",
      content: {
        "application/json": {
          schema: zBareBookmarkSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "attachTagsToBookmark",
  method: "post",
  path: "/bookmarks/{bookmarkId}/tags",
  description:
    "Attach one or more tags to a bookmark. Tags can be identified by ID or name. " +
    "If a tag name is provided and the tag doesn't exist, it will be created automatically.",
  summary: "Attach tags to a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    body: {
      description:
        "The tags to attach. Each tag must have either a `tagId` or a `tagName`.",
      content: {
        "application/json": {
          schema: z.object({ tags: z.array(zManipulatedTagSchema) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The IDs of the tags that were attached.",
      content: {
        "application/json": {
          schema: z.object({ attached: z.array(TagIdSchema) }),
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "detachTagsFromBookmark",
  method: "delete",
  path: "/bookmarks/{bookmarkId}/tags",
  description:
    "Detach one or more tags from a bookmark. Tags can be identified by ID or name.",
  summary: "Detach tags from a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    body: {
      description:
        "The tags to detach. Each tag must have either a `tagId` or a `tagName`.",
      content: {
        "application/json": {
          schema: z.object({ tags: z.array(zManipulatedTagSchema) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The IDs of the tags that were detached.",
      content: {
        "application/json": {
          schema: z.object({ detached: z.array(TagIdSchema) }),
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "getBookmarkLists",
  method: "get",
  path: "/bookmarks/{bookmarkId}/lists",
  description: "Retrieve all lists that contain the specified bookmark.",
  summary: "Get lists of a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    200: {
      description: "The lists that contain this bookmark.",
      content: {
        "application/json": {
          schema: z.object({ lists: z.array(ListSchema) }),
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "getBookmarkHighlights",
  method: "get",
  path: "/bookmarks/{bookmarkId}/highlights",
  description: "Retrieve all text highlights within the specified bookmark.",
  summary: "Get highlights of a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
  },
  responses: {
    200: {
      description: "The highlights within this bookmark.",
      content: {
        "application/json": {
          schema: z.object({ highlights: z.array(HighlightSchema) }),
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "attachAssetToBookmark",
  method: "post",
  path: "/bookmarks/{bookmarkId}/assets",
  description:
    "Attach a previously uploaded asset to a bookmark. The asset must be uploaded first via the POST /assets endpoint.",
  summary: "Attach asset to a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({ bookmarkId: BookmarkIdSchema }),
    body: {
      description: "The asset ID and type to attach.",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().describe("The ID of the previously uploaded asset."),
            assetType: zAssetTypesSchema.describe(
              "The type classification for this asset.",
            ),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "The asset was attached successfully.",
      content: {
        "application/json": {
          schema: zAssetSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "replaceAssetOnBookmark",
  method: "put",
  path: "/bookmarks/{bookmarkId}/assets/{assetId}",
  description:
    "Replace an existing asset on a bookmark with a different previously uploaded asset.",
  summary: "Replace asset on a bookmark",
  tags: ["Bookmarks"],
  security: [{ [BearerAuth.name]: [] }],
  request: {
    params: z.object({
      bookmarkId: BookmarkIdSchema,
      assetId: AssetIdSchema,
    }),
    body: {
      description: "The ID of the new asset to replace the existing one.",
      content: {
        "application/json": {
          schema: z.object({
            assetId: z
              .string()
              .describe("The ID of the new asset to use as a replacement."),
          }),
        },
      },
    },
  },
  responses: {
    204: {
      description: "No content — asset was replaced successfully.",
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark or asset not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  operationId: "detachAssetFromBookmark",
  method: "delete",
  path: "/bookmarks/{bookmarkId}/assets/{assetId}",
  description: "Detach an asset from a bookmark.",
  summary: "Detach asset from a bookmark",
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
      description: "No content — asset was detached successfully.",
    },
    401: UnauthorizedResponse,
    404: {
      description: "Bookmark or asset not found.",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});
