// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PageViewport } from "pdfjs-dist";

import type { ZPdfHighlightAnchor } from "@karakeep/shared/types/highlights";

import {
  pdfHighlightsForPage,
  pdfRectToViewport,
  selectionToPdfRects,
} from "./pdfHighlights";

// An independently specified 300x400-point page, including PDF's upward Y axis.
function viewport(scale: number): PageViewport {
  return {
    width: 300 * scale,
    height: 400 * scale,
    convertToPdfPoint: (x: number, y: number) => [x / scale, 400 - y / scale],
    convertToViewportRectangle: ([x1, y1, x2, y2]: number[]) => [
      x1 * scale,
      (400 - y1) * scale,
      x2 * scale,
      (400 - y2) * scale,
    ],
  } as PageViewport;
}

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: function (this: Range) {
      const text = this.startContainer as Text;
      const top = Number(text.parentElement?.dataset.top ?? 240);
      return [
        new DOMRect(
          120 + this.startOffset * 10,
          top,
          (this.endOffset - this.startOffset) * 10,
          20,
        ),
      ];
    },
  });
});

describe("PDF highlight selection and restoration", () => {
  test("saves a partial text selection in PDF coordinates and restores it at a different zoom", () => {
    const layer = document.createElement("div");
    layer.innerHTML = "<span>abcdef</span>";
    document.body.append(layer);
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 200, 600, 800),
    );
    const text = layer.firstElementChild!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 3);
    const rects = selectionToPdfRects(range, layer, viewport(2), 1);
    expect(rects).toEqual([{ pageIndex: 1, x1: 15, y1: 370, x2: 25, y2: 380 }]);
    const restored = JSON.parse(JSON.stringify(rects));
    expect(pdfRectToViewport(restored[0], viewport(3))).toEqual({
      left: 45,
      top: 60,
      width: 30,
      height: 30,
    });
  });

  test("records each selected text line once instead of including parent rectangles", () => {
    const layer = document.createElement("div");
    layer.innerHTML = '<span>abc</span><span data-top="280">def</span>';
    document.body.append(layer);
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 200, 600, 800),
    );
    const range = document.createRange();
    range.setStart(layer.firstElementChild!.firstChild!, 1);
    range.setEnd(layer.lastElementChild!.firstChild!, 2);
    expect(selectionToPdfRects(range, layer, viewport(2), 0)).toEqual([
      { pageIndex: 0, x1: 15, y1: 370, x2: 25, y2: 380 },
      { pageIndex: 0, x1: 10, y1: 350, x2: 20, y2: 360 },
    ]);
  });

  test("ignores collapsed selections and selections outside the PDF text layer", () => {
    const layer = document.createElement("div");
    const outside = document.createTextNode("Other panel");
    document.body.append(layer, outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    expect(selectionToPdfRects(range, layer, viewport(1), 0)).toEqual([]);
    range.collapse();
    expect(selectionToPdfRects(range, layer, viewport(1), 0)).toEqual([]);
  });
  test("filters HTML records, other pages and replacement assets", () => {
    const anchor: ZPdfHighlightAnchor = {
      version: 1,
      assetId: "first-pdf",
      rects: [{ pageIndex: 1, x1: 10, y1: 20, x2: 30, y2: 40 }],
    };
    const html = { id: "html", pdfAnchor: null };
    const pdf = { id: "pdf", pdfAnchor: anchor };
    expect(pdfHighlightsForPage([html, pdf], "first-pdf", 1)).toEqual([pdf]);
    expect(pdfHighlightsForPage([html, pdf], "first-pdf", 0)).toEqual([]);
    expect(pdfHighlightsForPage([html, pdf], "replacement", 1)).toEqual([]);
  });
});
