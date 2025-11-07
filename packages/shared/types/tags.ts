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

export const zTagCursorSchema = z.object({
  page: z.number().int().min(0),
});

export const zTagListRequestSchema = z.object({
  nameContains: z.string().optional(),
  attachedBy: z.enum([...zAttachedByEnumSchema.options, "none"]).optional(),
  sortBy: z.enum(["name", "usage", "relevance"]).optional().default("usage"),
  cursor: zTagCursorSchema.nullish().default({ page: 0 }),
  // TODO: Remove the optional to enforce a limit after the next release
  limit: z.number().int().min(1).max(MAX_NUM_TAGS_PER_PAGE).optional(),
});

export const zTagListValidatedRequestSchema = zTagListRequestSchema.refine(
  (val) => val.sortBy != "relevance" || val.nameContains !== undefined,
  {
    message: "Relevance sorting requires a nameContains filter",
    path: ["sortBy"],
  },
);

export const zTagListResponseSchema = z.object({
  tags: z.array(zGetTagResponseSchema),
  nextCursor: zTagCursorSchema.nullish(),
});
export type ZTagListResponse = z.infer<typeof zTagListResponseSchema>;

// API Types

export const zTagListQueryParamsSchema = z.object({
  nameContains: zTagListRequestSchema.shape.nameContains,
  sort: zTagListRequestSchema.shape.sortBy,
  attachedBy: zTagListRequestSchema.shape.attachedBy,
  cursor: z
    .string()
    .transform((val, ctx) => {
      try {
        return JSON.parse(Buffer.from(val, "base64url").toString("utf8"));
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Invalid cursor",
        });
        return z.NEVER;
      }
    })
    .optional()
    .pipe(zTagListRequestSchema.shape.cursor),
  limit: z.coerce.number().optional(),
});

export const zTagListApiResultSchema = z.object({
  tags: zTagListResponseSchema.shape.tags,
  nextCursor: z.string().nullish(),
});
