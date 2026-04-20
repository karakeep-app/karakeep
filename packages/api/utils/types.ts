import { z } from "zod";

import { zSortOrder } from "@karakeep/shared/types/bookmarks";

export const zStringBool = z
  .string()
  .refine((val) => val === "true" || val === "false", "Must be true or false")
  .transform((val) => val === "true");

export const zIncludeContentSearchParamsSchema = z.object({
  includeContent: zStringBool.optional().prefault("false"),
});

export const zGetBookmarkQueryParamsSchema = z
  .object({
    sortOrder: zSortOrder
      .exclude([zSortOrder.enum.relevance])
      .optional()
      .default(zSortOrder.enum.desc),
  })
  .extend(zIncludeContentSearchParamsSchema.shape);

export const zGetBookmarkSearchParamsSchema = z
  .object({
    sortOrder: zSortOrder.optional().default(zSortOrder.enum.relevance),
  })
  .extend(zIncludeContentSearchParamsSchema.shape);
