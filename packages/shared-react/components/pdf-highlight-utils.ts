import type { ZPdfHighlightMetadata } from "@karakeep/shared/types/highlights";

export interface PdfClientRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PdfPageBounds {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Converts browser selection rectangles into page-relative coordinates.
 * Keeping the coordinates normalized means highlights survive zoom, device
 * pixel ratio changes, and the PDF.js viewport being resized on mobile.
 */
export function pdfHighlightMetadataFromSelection(
  selectionRects: readonly PdfClientRect[],
  pages: readonly PdfPageBounds[],
): ZPdfHighlightMetadata | null {
  const metadataPages = pages
    .map((page) => {
      if (page.width <= 0 || page.height <= 0) {
        return null;
      }

      const rects = selectionRects
        .map((selectionRect) => {
          const left = Math.max(selectionRect.left, page.left);
          const top = Math.max(selectionRect.top, page.top);
          const right = Math.min(selectionRect.right, page.left + page.width);
          const bottom = Math.min(selectionRect.bottom, page.top + page.height);

          if (right <= left || bottom <= top) {
            return null;
          }

          return {
            x: clamp((left - page.left) / page.width, 0, 1),
            y: clamp((top - page.top) / page.height, 0, 1),
            width: clamp((right - left) / page.width, 0, 1),
            height: clamp((bottom - top) / page.height, 0, 1),
          };
        })
        .filter((rect): rect is NonNullable<typeof rect> => rect !== null);

      if (rects.length === 0) {
        return null;
      }

      return { pageIndex: page.pageIndex, rects };
    })
    .filter((page): page is NonNullable<typeof page> => page !== null);

  return metadataPages.length > 0 ? { pages: metadataPages } : null;
}
