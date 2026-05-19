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
    includeMatchedContent: zStringBool.optional().prefault("false"),
    matchedContentLength: z.coerce
      .number()
      .int()
      .positive()
      .max(4000)
      .optional(),
  })
  .extend(zIncludeContentSearchParamsSchema.shape);

export const zGetBookmarkContentSearchParamsSchema = z.object({
  startOffset: z.coerce.number().int().nonnegative().optional().default(0),
  maxLength: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000)
    .optional()
    .default(4000),
});
