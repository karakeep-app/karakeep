import { z } from "zod";

import { parseSearchQuery } from "../searchQueryParser";

export const MAX_LIST_NAME_LENGTH = 100;
export const MAX_LIST_DESCRIPTION_LENGTH = 500;

export const zNewBookmarkListSchema = z
  .object({
    name: z
      .string()
      .min(1, "List name can't be empty")
      .max(
        MAX_LIST_NAME_LENGTH,
        `List name is at most ${MAX_LIST_NAME_LENGTH} chars`,
      ),
    description: z
      .string()
      .min(0, "Description can be empty")
      .max(
        MAX_LIST_DESCRIPTION_LENGTH,
        `Description can have at most ${MAX_LIST_DESCRIPTION_LENGTH} chars`,
      )
      .optional(),
    icon: z.string(),
    type: z.enum(["manual", "smart"]).optional().default("manual"),
    query: z.string().min(1).optional(),
    parentId: z.string().nullish(),
  })
  .refine((val) => val.type === "smart" || !val.query, {
    message: "Manual lists cannot have a query",
    path: ["query"],
  })
  .refine((val) => val.type === "manual" || val.query, {
    message: "Smart lists must have a query",
    path: ["query"],
  })
  .refine(
    (val) => !val.query || parseSearchQuery(val.query).result === "full",
    {
      message: "Smart search query is not valid",
      path: ["query"],
    },
  )
  .refine((val) => !val.query || parseSearchQuery(val.query).text.length == 0, {
    message:
      "Smart lists cannot have unqualified terms (aka full text search terms) in the query",
    path: ["query"],
  });

export const zBookmarkListSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  icon: z.string(),
  parentId: z.string().nullable(),
  type: z.enum(["manual", "smart"]).default("manual"),
  query: z.string().nullish(),
  public: z.boolean(),
});

export type ZBookmarkList = z.infer<typeof zBookmarkListSchema>;

export const zEditBookmarkListSchema = z.object({
  listId: z.string(),
  name: z
    .string()
    .min(1, "List name can't be empty")
    .max(
      MAX_LIST_NAME_LENGTH,
      `List name is at most ${MAX_LIST_NAME_LENGTH} chars`,
    )
    .optional(),
  description: z
    .string()
    .min(0, "Description can be empty")
    .max(
      MAX_LIST_DESCRIPTION_LENGTH,
      `Description can have at most ${MAX_LIST_DESCRIPTION_LENGTH} chars`,
    )
    .nullish(),
  icon: z.string().optional(),
  parentId: z.string().nullish(),
  query: z.string().min(1).optional(),
  public: z.boolean().optional(),
});

export const zEditBookmarkListSchemaWithValidation = zEditBookmarkListSchema
  .refine((val) => val.parentId != val.listId, {
    message: "List can't be its own parent",
    path: ["parentId"],
  })
  .refine(
    (val) => !val.query || parseSearchQuery(val.query).result === "full",
    {
      message: "Smart search query is not valid",
      path: ["query"],
    },
  )
  .refine((val) => !val.query || parseSearchQuery(val.query).text.length == 0, {
    message:
      "Smart lists cannot have unqualified terms (aka full text search terms) in the query",
    path: ["query"],
  });

export const zMergeListSchema = z
  .object({
    sourceId: z.string(),
    targetId: z.string(),
    deleteSourceAfterMerge: z.boolean(),
  })
  .refine((val) => val.sourceId !== val.targetId, {
    message: "Cannot merge a list into itself",
    path: ["targetId"],
  });

export type ZMergeList = z.infer<typeof zMergeListSchema>;
