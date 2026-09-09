import { describe, expect, it } from "vitest";

import {
  MAX_PDF_HIGHLIGHT_PAGES,
  MAX_PDF_HIGHLIGHT_RECTS_PER_PAGE,
  zPdfHighlightMetadataSchema,
} from "@karakeep/shared/types/highlights";

import { pdfHighlightMetadataFromSelection } from "./pdf-highlight-utils";
import type { PdfClientRect, PdfPageBounds } from "./pdf-highlight-utils";

const pages: PdfPageBounds[] = [
  { pageIndex: 0, left: 10, top: 20, width: 200, height: 400 },
  { pageIndex: 1, left: 10, top: 440, width: 200, height: 400 },
];

function rect(
  left: number,
  top: number,
  right: number,
  bottom: number,
): PdfClientRect {
  return { left, top, right, bottom };
}

describe("pdfHighlightMetadataFromSelection", () => {
  it("normalizes a selection on one page", () => {
    expect(
      pdfHighlightMetadataFromSelection([rect(60, 120, 160, 220)], pages),
    ).toEqual({
      pages: [
        {
          pageIndex: 0,
          rects: [{ x: 0.25, y: 0.25, width: 0.5, height: 0.25 }],
        },
      ],
    });
  });

  it("splits a cross-page selection into page-local rectangles", () => {
    expect(
      pdfHighlightMetadataFromSelection([rect(20, 390, 180, 470)], pages),
    ).toEqual({
      pages: [
        {
          pageIndex: 0,
          rects: [{ x: 0.05, y: 0.925, width: 0.8, height: 0.075 }],
        },
        {
          pageIndex: 1,
          rects: [{ x: 0.05, y: 0, width: 0.8, height: 0.075 }],
        },
      ],
    });
  });

  it("clips rectangles outside a page and rejects invalid pages", () => {
    expect(
      pdfHighlightMetadataFromSelection(
        [rect(-50, -50, 60, 80)],
        [{ pageIndex: 0, left: 0, top: 0, width: 100, height: 100 }],
      ),
    ).toEqual({
      pages: [
        {
          pageIndex: 0,
          rects: [{ x: 0, y: 0, width: 0.6, height: 0.8 }],
        },
      ],
    });
    expect(
      pdfHighlightMetadataFromSelection(
        [rect(0, 0, 10, 10)],
        [{ pageIndex: 0, left: 0, top: 0, width: 0, height: 100 }],
      ),
    ).toBeNull();
  });

  it("bounds persisted page and rectangle collections", () => {
    const rect = { x: 0, y: 0, width: 0.1, height: 0.1 };
    const page = { pageIndex: 0, rects: [rect] };
    expect(
      zPdfHighlightMetadataSchema.safeParse({
        pages: Array.from({ length: MAX_PDF_HIGHLIGHT_PAGES + 1 }, () => page),
      }).success,
    ).toBe(false);
    expect(
      zPdfHighlightMetadataSchema.safeParse({
        pages: [
          {
            pageIndex: 0,
            rects: Array.from(
              { length: MAX_PDF_HIGHLIGHT_RECTS_PER_PAGE + 1 },
              () => rect,
            ),
          },
        ],
      }).success,
    ).toBe(false);
  });
});
