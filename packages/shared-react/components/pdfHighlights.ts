import type { PageViewport } from "pdfjs-dist";

import type { ZPdfHighlightAnchor } from "@karakeep/shared/types/highlights";

type PdfRect = ZPdfHighlightAnchor["rects"][number];

/** Store page coordinates, not screen pixels, so saved selections survive zoom. */
export function selectionToPdfRects(
  range: Range,
  textLayer: HTMLElement,
  viewport: PageViewport,
  pageIndex: number,
): PdfRect[] {
  if (range.collapsed || !textLayer.contains(range.commonAncestorContainer)) {
    return [];
  }
  const page = textLayer.getBoundingClientRect();
  if (!page.width || !page.height) return [];
  const rects: PdfRect[] = [];
  // A range can include an element's rectangle as well as its text. Keeping only
  // text-node intersections avoids duplicate or full-page highlight rectangles.
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!range.intersectsNode(node)) continue;
    const part = document.createRange();
    part.selectNodeContents(node);
    if (range.startContainer === node) part.setStart(node, range.startOffset);
    if (range.endContainer === node) part.setEnd(node, range.endOffset);
    if (part.collapsed) continue;
    for (const rect of Array.from(part.getClientRects())) {
      const left = Math.max(page.left, rect.left);
      const top = Math.max(page.top, rect.top);
      const right = Math.min(page.right, rect.right);
      const bottom = Math.min(page.bottom, rect.bottom);
      if (right <= left || bottom <= top) continue;
      const [x1, y1] = viewport.convertToPdfPoint(
        ((left - page.left) * viewport.width) / page.width,
        ((top - page.top) * viewport.height) / page.height,
      );
      const [x2, y2] = viewport.convertToPdfPoint(
        ((right - page.left) * viewport.width) / page.width,
        ((bottom - page.top) * viewport.height) / page.height,
      );
      rects.push({
        pageIndex,
        x1: Math.min(x1, x2),
        y1: Math.min(y1, y2),
        x2: Math.max(x1, x2),
        y2: Math.max(y1, y2),
      });
    }
  }
  return rects;
}

export function pdfRectToViewport(rect: PdfRect, viewport: PageViewport) {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
    rect.x1,
    rect.y1,
    rect.x2,
    rect.y2,
  ]);
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function pdfHighlightsForPage<
  T extends { pdfAnchor?: ZPdfHighlightAnchor | null },
>(highlights: T[], assetId: string, pageIndex: number): T[] {
  return highlights.filter(
    (highlight) =>
      highlight.pdfAnchor?.assetId === assetId &&
      highlight.pdfAnchor.rects.some((rect) => rect.pageIndex === pageIndex),
  );
}
