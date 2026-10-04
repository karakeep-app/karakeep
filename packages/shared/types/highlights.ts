import { z } from "zod";

import { zCursorV2 } from "./pagination";

export const DEFAULT_NUM_HIGHLIGHTS_PER_PAGE = 20;

const zHighlightColorSchema = z.enum(["yellow", "red", "green", "blue"]);
export type ZHighlightColor = z.infer<typeof zHighlightColorSchema>;
export const SUPPORTED_HIGHLIGHT_COLORS = zHighlightColorSchema.options;

export const zHighlightContentSchema = z.object({
  version: z.literal(1),
  parts: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string() }),
        z.object({
          type: z.literal("image"),
          index: z.number().int().nonnegative(),
          src: z
            .url()
            .refine(
              (url) => /^https?:\/\//i.test(url),
              "Expected an HTTP(S) image URL",
            ),
          alt: z.string(),
        }),
      ]),
    )
    .max(1000),
});
export type ZHighlightContent = z.infer<typeof zHighlightContentSchema>;

const zHighlightBaseSchema = z.object({
  bookmarkId: z.string(),
  startOffset: z.number(),
  endOffset: z.number(),
  color: zHighlightColorSchema.default("yellow"),
  text: z.string().nullable(),
  note: z.string().nullable(),
  // Older clients can continue using text without understanding rich content.
  content: zHighlightContentSchema.nullish(),
});

export const zHighlightSchema = zHighlightBaseSchema.extend(
  z.object({
    id: z.string(),
    userId: z.string(),
    createdAt: z.date(),
  }).shape,
);

export type ZHighlight = z.infer<typeof zHighlightSchema>;

export const zNewHighlightSchema = zHighlightBaseSchema;

export const zUpdateHighlightSchema = z.object({
  highlightId: z.string(),
  color: zHighlightColorSchema.optional(),
  note: z.string().nullable().optional(),
});

export const zGetAllHighlightsResponseSchema = z.object({
  highlights: z.array(zHighlightSchema),
  nextCursor: zCursorV2.nullable(),
});
export type ZGetAllHighlightsResponse = z.infer<
  typeof zGetAllHighlightsResponseSchema
>;
