import { z } from "zod";

import { zCursorV2 } from "./pagination";

export const DEFAULT_NUM_HIGHLIGHTS_PER_PAGE = 20;

const zHighlightColorSchema = z.enum(["yellow", "red", "green", "blue"]);
export type ZHighlightColor = z.infer<typeof zHighlightColorSchema>;
export const SUPPORTED_HIGHLIGHT_COLORS = zHighlightColorSchema.options;

const pdfCoordinate = z.number().finite().min(-10_000_000).max(10_000_000);
export const zPdfHighlightLocationSchema = z.object({
  assetId: z.string().min(1),
  rects: z
    .array(
      z
        .object({
          page: z.number().int().min(1).max(1_000_000),
          x1: pdfCoordinate,
          y1: pdfCoordinate,
          x2: pdfCoordinate,
          y2: pdfCoordinate,
        })
        .refine(
          (r) => r.x1 < r.x2 && r.y1 < r.y2,
          "Expected a non-empty PDF rectangle",
        ),
    )
    .min(1)
    .max(2000),
});
export type ZPdfHighlightLocation = z.infer<typeof zPdfHighlightLocationSchema>;

const zHighlightBaseSchema = z.object({
  bookmarkId: z.string(),
  startOffset: z.number(),
  endOffset: z.number(),
  color: zHighlightColorSchema.default("yellow"),
  text: z.string().nullable(),
  note: z.string().nullable(),
  pdfLocation: zPdfHighlightLocationSchema.nullish(),
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
