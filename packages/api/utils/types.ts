import { z } from "zod";

import { zSortOrder } from "@karakeep/shared/types/bookmarks";

export const zStringBool = z
  .string()
  .refine((val) => val === "true" || val === "false", "Must be true or false")
  .transform((val) => val === "true");

export const zIncludeContentSearchParamsSchema = z.object({
  includeContent: zStringBool.optional().default("false"),
});

export const zGetBookmarkQueryParamsSchema = z
  .object({
    sortOrder: zSortOrder
      .exclude([zSortOrder.Enum.relevance])
      .optional()
      .default(zSortOrder.Enum.desc),
  })
  .merge(zIncludeContentSearchParamsSchema);

export const zGetBookmarkSearchParamsSchema = z
  .object({
    sortOrder: zSortOrder.optional().default(zSortOrder.Enum.relevance),
  })
  .merge(zIncludeContentSearchParamsSchema);
