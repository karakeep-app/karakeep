import { z } from "zod";

import { normalizeTagName } from "../utils/tag";

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
