import { z } from "zod";

import { zCursorV2 } from "./pagination";

export const DEFAULT_NUM_HIGHLIGHTS_PER_PAGE = 20;

const zHighlightColorSchema = z.enum(["yellow", "red", "green", "blue"]);
export type ZHighlightColor = z.infer<typeof zHighlightColorSchema>;
export const SUPPORTED_HIGHLIGHT_COLORS = zHighlightColorSchema.options;

const zPdfHighlightRectSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    x1: z.number().finite(),
    y1: z.number().finite(),
    x2: z.number().finite(),
    y2: z.number().finite(),
  })
  .refine((rect) => rect.x2 > rect.x1 && rect.y2 > rect.y1, {
    message: "PDF highlight rectangles must have positive area",
  });

// PDF page coordinates are independent of the current zoom or viewport size.
export const zPdfHighlightAnchorSchema = z.object({
  version: z.literal(1),
  assetId: z.string().min(1),
  rects: z.array(zPdfHighlightRectSchema).min(1).max(512),
});
export type ZPdfHighlightAnchor = z.infer<typeof zPdfHighlightAnchorSchema>;

const zHighlightBaseSchema = z.object({
  bookmarkId: z.string(),
  startOffset: z.number(),
  endOffset: z.number(),
  color: zHighlightColorSchema.default("yellow"),
  text: z.string().nullable(),
  note: z.string().nullable(),
  // Null denotes an HTML highlight. PDF records use 0/0 for legacy offsets.
  pdfAnchor: zPdfHighlightAnchorSchema.nullish(),
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
