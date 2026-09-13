import type { PageViewport } from "pdfjs-dist/types/src/display/display_utils";

import type { ZPdfHighlightLocation } from "@karakeep/shared/types/highlights";

export interface PDFPageGeometry {
  element: HTMLElement;
  viewport: PageViewport;
}

/** Convert CSS pixels to PDF coordinates, independent of zoom and rotation. */
export function toPdfRectangle(
  rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
  pageBounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
  viewport: PageViewport,
  page: number,
) {
  const points = [
    viewport.convertToPdfPoint(
      ((rect.left - pageBounds.left) / pageBounds.width) * viewport.width,
      ((rect.top - pageBounds.top) / pageBounds.height) * viewport.height,
    ),
    viewport.convertToPdfPoint(
      ((rect.right - pageBounds.left) / pageBounds.width) * viewport.width,
      ((rect.bottom - pageBounds.top) / pageBounds.height) * viewport.height,
    ),
  ];
  return {
    page,
    x1: Math.min(points[0][0], points[1][0]),
    y1: Math.min(points[0][1], points[1][1]),
    x2: Math.max(points[0][0], points[1][0]),
    y2: Math.max(points[0][1], points[1][1]),
  };
}

export function toViewportRectangle(
  rect: ZPdfHighlightLocation["rects"][number],
  viewport: PageViewport,
) {
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

function selectedText(range: Range): string {
  const fragment = range.cloneContents();
  const walker = document.createTreeWalker(
    fragment,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    else if ((node as Element).tagName === "BR") text += "\n";
  }
  return text;
}

export function capturePdfSelection(
  selection: Selection | null,
  pages: Map<number, PDFPageGeometry>,
  assetId: string,
): { text: string; pdfLocation: ZPdfHighlightLocation } | null {
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const allPages = [...pages.entries()].sort(([a], [b]) => a - b);
  // Reject selections beginning/ending outside this viewer's text layers.
  if (
    !allPages.some(([, p]) => p.element.contains(range.startContainer)) ||
    !allPages.some(([, p]) => p.element.contains(range.endContainer))
  )
    return null;

  const texts: string[] = [];
  const rects: ZPdfHighlightLocation["rects"] = [];
  for (const [page, geometry] of allPages) {
    const { element, viewport } = geometry;
    if (!range.intersectsNode(element)) continue;
    const local = document.createRange();
    local.selectNodeContents(element);
    if (element.contains(range.startContainer))
      local.setStart(range.startContainer, range.startOffset);
    if (element.contains(range.endContainer))
      local.setEnd(range.endContainer, range.endOffset);
    const text = selectedText(local);
    if (!text.trim()) continue;
    texts.push(text);
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) continue;
    // Element ranges can include both a span's box and its text box, producing
    // darker overlapping rectangles. Measure each selected text node once.
    const textNodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const selectedRects: DOMRect[] = [];
    for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
      if (!local.intersectsNode(node)) continue;
      const piece = document.createRange();
      piece.selectNodeContents(node);
      if (node === local.startContainer)
        piece.setStart(node, local.startOffset);
      if (node === local.endContainer) piece.setEnd(node, local.endOffset);
      if (!piece.collapsed)
        selectedRects.push(...Array.from(piece.getClientRects()));
    }
    for (const rect of selectedRects) {
      const clipped = {
        left: Math.max(rect.left, bounds.left),
        top: Math.max(rect.top, bounds.top),
        right: Math.min(rect.right, bounds.right),
        bottom: Math.min(rect.bottom, bounds.bottom),
      };
      if (
        clipped.right - clipped.left < 0.5 ||
        clipped.bottom - clipped.top < 0.5
      )
        continue;
      const converted = toPdfRectangle(clipped, bounds, viewport, page);
      rects.push(converted);
    }
  }
  const text = texts.join("\n\n").trim();
  if (!text || !rects.length || rects.length > 2000) return null;
  return { text, pdfLocation: { assetId, rects } };
}
