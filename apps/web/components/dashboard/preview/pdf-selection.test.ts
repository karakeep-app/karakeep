// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

import { capturePdfSelection } from "@karakeep/shared-react/components/pdf-selection";
import type { PDFPageGeometry } from "@karakeep/shared-react/components/pdf-selection";

const originalRects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  if (originalRects)
    Object.defineProperty(Range.prototype, "getClientRects", originalRects);
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});

function fixture() {
  document.body.innerHTML =
    '<div id="outside">Other content</div><div id="one"><span>First line</span><br><span>Second line</span></div><div id="two"><span>Next page</span></div>';
  const pages = new Map<number, PDFPageGeometry>();
  for (const [index, id] of ["one", "two"].entries()) {
    const element = document.getElementById(id)!;
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(10, 20 + index * 200, 100, 100),
    );
    pages.set(index + 1, {
      element,
      viewport: {
        width: 100,
        height: 100,
        convertToPdfPoint: (x: number, y: number) => [x, 100 - y],
      } as PDFPageGeometry["viewport"],
    });
  }
  // jsdom does not perform layout; each text node has exactly one measured box.
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: function (this: Range) {
      const page = this.startContainer.parentElement?.closest("#two");
      return [new DOMRect(15, page ? 225 : 25, 50, 10)];
    },
  });
  const select = (start: Node, end: Node) => {
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.textContent!.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  };
  return {
    pages,
    select,
    first: document.querySelector("#one span")!.firstChild!,
    last: document.querySelector("#two span")!.firstChild!,
  };
}

describe("PDF text selection", () => {
  test("preserves line and page breaks and measures each text node once", () => {
    const { pages, select, first, last } = fixture();
    const selected = capturePdfSelection(select(first, last), pages, "asset");
    expect(selected?.text).toBe("First line\nSecond line\n\nNext page");
    expect(selected?.pdfLocation.rects).toEqual([
      { page: 1, x1: 5, y1: 85, x2: expect.closeTo(55), y2: 95 },
      { page: 1, x1: 5, y1: 85, x2: expect.closeTo(55), y2: 95 },
      { page: 2, x1: 5, y1: 85, x2: expect.closeTo(55), y2: 95 },
    ]);
  });

  test("rejects selections crossing content outside the PDF viewer", () => {
    const { pages, select, last } = fixture();
    expect(
      capturePdfSelection(
        select(document.getElementById("outside")!.firstChild!, last),
        pages,
        "asset",
      ),
    ).toBeNull();
  });

  test("does not save a collapsed selection", () => {
    const { pages, select, first } = fixture();
    const selection = select(first, first);
    selection.collapseToStart();
    expect(capturePdfSelection(selection, pages, "asset")).toBeNull();
  });
});
