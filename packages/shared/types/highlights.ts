import { z } from "zod";

import { zCursorV2 } from "./pagination";

export const DEFAULT_NUM_HIGHLIGHTS_PER_PAGE = 20;

const zHighlightColorSchema = z.enum(["yellow", "red", "green", "blue"]);
export type ZHighlightColor = z.infer<typeof zHighlightColorSchema>;
export const SUPPORTED_HIGHLIGHT_COLORS = zHighlightColorSchema.options;

const zPdfHighlightRectSchema = z.object({
  // Rectangles are normalized to the page so zoom and device pixel ratio do
  // not change the persisted highlight position.
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
});

const zPdfHighlightPageSchema = z.object({
  pageIndex: z.number().int().nonnegative(),
  rects: z.array(zPdfHighlightRectSchema).min(1),
});

export const zPdfHighlightMetadataSchema = z.object({
  pages: z.array(zPdfHighlightPageSchema).min(1),
});

export type ZPdfHighlightMetadata = z.infer<typeof zPdfHighlightMetadataSchema>;

const zHighlightBaseSchema = z.object({
  bookmarkId: z.string(),
  startOffset: z.number(),
  endOffset: z.number(),
  color: zHighlightColorSchema.default("yellow"),
  text: z.string().nullable(),
  note: z.string().nullable(),
  pdf: zPdfHighlightMetadataSchema.nullable().optional(),
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
