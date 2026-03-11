import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { zBookmarkSchema } from "@karakeep/shared/types/bookmarks";
import { zHighlightSchema } from "@karakeep/shared/types/highlights";
import { zBookmarkListSchema } from "@karakeep/shared/types/lists";
import { zGetTagResponseSchema } from "@karakeep/shared/types/tags";

extendZodWithOpenApi(z);

export const ListSchema = zBookmarkListSchema.openapi("List");

export const BookmarkSchema = zBookmarkSchema.openapi("Bookmark");

export const PaginatedBookmarksSchema = z
  .object({
    bookmarks: z.array(BookmarkSchema),
    nextCursor: z
      .string()
      .nullable()
      .describe("Cursor for the next page, or null if no more results."),
  })
  .openapi("PaginatedBookmarks");

export const CursorSchema = z
  .string()
  .describe("An opaque cursor string for pagination.")
  .openapi("Cursor");

export const PaginationSchema = z
  .object({
    limit: z
      .number()
      .optional()
      .describe("Maximum number of items to return per page."),
    cursor: CursorSchema.optional().describe(
      "Cursor from a previous response to fetch the next page.",
    ),
  })
  .openapi("Pagination");

export const IncludeContentSearchParamSchema = z.object({
  includeContent: z
    .boolean()
    .default(false)
    .describe(
      "If set to true, the bookmark's full content (HTML, text, etc.) will be included in the response. " +
        "Set to false for lighter responses when only metadata is needed.",
    ),
});

export const HighlightSchema = zHighlightSchema.openapi("Highlight");

export const PaginatedHighlightsSchema = z
  .object({
    highlights: z.array(HighlightSchema),
    nextCursor: z
      .string()
      .nullable()
      .describe("Cursor for the next page, or null if no more results."),
  })
  .openapi("PaginatedHighlights");

export const TagSchema = zGetTagResponseSchema.openapi("Tag");
