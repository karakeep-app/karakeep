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
    nextCursor: z.string().nullable(),
  })
  .openapi("PaginatedBookmarks");

export const CursorSchema = z.string().openapi("Cursor");

export const PaginationSchema = z
  .object({
    limit: z.number().optional(),
    cursor: CursorSchema.optional(),
  })
  .openapi("Pagination");

export const IncludeContentSearchParamSchema = z.object({
  includeContent: z
    .boolean()
    .default(true)
    .describe(
      "If set to true, bookmark's content will be included in the response. Note, this content can be large for some bookmarks.",
    ),
});

export const HighlightSchema = zHighlightSchema.openapi("Highlight");

export const PaginatedHighlightsSchema = z
  .object({
    highlights: z.array(HighlightSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("PaginatedHighlights");

export const TagSchema = zGetTagResponseSchema.openapi("Tag");
