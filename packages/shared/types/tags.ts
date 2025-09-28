import { z } from "zod";

import { normalizeTagName } from "../utils/tag";

export const MAX_NUM_TAGS_PER_PAGE = 1000;

const zTagNameSchemaWithValidation = z
  .string()
  .transform((s) => normalizeTagName(s).trim())
  .pipe(z.string().min(1));

export const zCreateTagRequestSchema = z.object({
  name: zTagNameSchemaWithValidation,
});

export const zAttachedByEnumSchema = z.enum(["ai", "human"]);
export type ZAttachedByEnum = z.infer<typeof zAttachedByEnumSchema>;
export const zBookmarkTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  attachedBy: zAttachedByEnumSchema,
});
export type ZBookmarkTags = z.infer<typeof zBookmarkTagSchema>;

export const zGetTagResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  numBookmarks: z.number(),
  numBookmarksByAttachedType: z.record(zAttachedByEnumSchema, z.number()),
});
export type ZGetTagResponse = z.infer<typeof zGetTagResponseSchema>;

export const zUpdateTagRequestSchema = z.object({
  tagId: z.string(),
  name: zTagNameSchemaWithValidation.optional(),
});

export const zTagBasicSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type ZTagBasic = z.infer<typeof zTagBasicSchema>;

export const zTagCusrsorSchema = z.object({
  page: z.number(),
});

export const zTagListRequestSchema = z
  .object({
    nameContains: z.string().optional(),
    attachedBy: z.enum([...zAttachedByEnumSchema.options, "none"]).optional(),
    sortBy: z.enum(["name", "usage", "relevance"]).optional().default("usage"),
    cursor: zTagCusrsorSchema.default({ page: 0 }),
    // TODO: Enforce a maximum limit after the next release
    limit: z.number().optional(),
  })
  .refine(
    (val) => val.sortBy != "relevance" || val.nameContains !== undefined,
    {
      message: "Relevance sorting requires a nameContains filter",
      path: ["sortBy"],
    },
  );

export const zTagListResponseSchema = z.object({
  tags: z.array(zGetTagResponseSchema),
  // TODO: The optional is here for backwards compatibility.
  // Newer clients might expect it from servers that are older and not
  // sending it. Those servers are before pagination, so they return
  // all the tags. Hence the default being false.
  hasNextPage: z.boolean().optional().default(false),
});
export type ZTagListResponse = z.infer<typeof zTagListResponseSchema>;
