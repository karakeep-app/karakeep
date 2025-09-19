import { z } from "zod";

const MAX_PROMPT_TEXT_LENGTH = 500;

export const zAppliesToEnumSchema = z.enum([
  "all_tagging",
  "text",
  "images",
  "summary",
]);

export const zPromptSchema = z.object({
  id: z.string(),
  text: z.string(),
  enabled: z.boolean(),
  appliesTo: zAppliesToEnumSchema,
});

export type ZPrompt = z.infer<typeof zPromptSchema>;

export const zNewPromptSchema = z.object({
  text: z.string().min(1).max(MAX_PROMPT_TEXT_LENGTH),
  appliesTo: zAppliesToEnumSchema,
});

export const zUpdatePromptSchema = z.object({
  promptId: z.string(),
  text: z.string().max(MAX_PROMPT_TEXT_LENGTH).optional(),
  appliesTo: zAppliesToEnumSchema.optional(),
  enabled: z.boolean().optional(),
});
