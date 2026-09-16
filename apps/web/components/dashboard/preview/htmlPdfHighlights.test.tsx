// @vitest-environment jsdom
import React from "react";
import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";

test("the shared HTML renderer ignores PDF anchors while retaining legacy highlights", () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  const { container } = render(
    <BookmarkHTMLHighlighter
      htmlContent="<p>abcdef</p>"
      readOnly
      highlights={[
        {
          id: "html",
          startOffset: 0,
          endOffset: 2,
          color: "yellow",
          text: "ab",
        },
        {
          id: "pdf",
          startOffset: 3,
          endOffset: 5,
          color: "blue",
          text: "de",
          pdfAnchor: {
            version: 1,
            assetId: "pdf",
            rects: [{ pageIndex: 0, x1: 1, y1: 1, x2: 2, y2: 2 }],
          },
        },
      ]}
    />,
  );
  expect(
    container.querySelector('[data-highlight-id="html"]')?.textContent,
  ).toBe("ab");
  expect(container.querySelector('[data-highlight-id="pdf"]')).toBeNull();
  expect(container.querySelector("p")?.textContent).toBe("abcdef");
});
