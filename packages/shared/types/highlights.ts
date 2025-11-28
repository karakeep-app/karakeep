import { z } from "zod";

import { zCursorV2 } from "./pagination";

export const DEFAULT_NUM_HIGHLIGHTS_PER_PAGE = 20;

const zHighlightColorSchema = z.enum(["yellow", "red", "green", "blue"]);
export type ZHighlightColor = z.infer<typeof zHighlightColorSchema>;
export const SUPPORTED_HIGHLIGHT_COLORS = zHighlightColorSchema.options;

const zHighlightBaseSchema = z.object({
  bookmarkId: z.string(),
  startOffset: z.number(),
  endOffset: z.number(),
  color: zHighlightColorSchema.default("yellow"),
  text: z.string().nullable(),
  note: z.string().nullable(),
});

export const zHighlightSchema = zHighlightBaseSchema.merge(
  z.object({
    id: z.string(),
    userId: z.string(),
    createdAt: z.date(),
  }),
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
