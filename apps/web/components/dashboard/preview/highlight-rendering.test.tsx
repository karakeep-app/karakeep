// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Highlight } from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import HighlightContent from "@karakeep/shared-react/components/HighlightContent";

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});
afterEach(cleanup);

const html =
  '<p>Before<img src="https://example.com/a.png" alt="First"><img src="https://example.com/a.png" alt="Second">After</p>';
const imageHighlight: Highlight = {
  id: "image",
  startOffset: 6,
  endOffset: 6,
  text: "[Second]",
  color: "blue",
  content: {
    version: 1,
    parts: [
      {
        type: "image",
        index: 1,
        src: "https://example.com/a.png",
        alt: "Second",
      },
    ],
  },
};

describe("persisted image highlights", () => {
  it("never interprets old text as active markup", () => {
    const text = '<img src="https://example.com/private">';
    const { container } = render(<HighlightContent text={text} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe(text);
  });

  it("renders rich images and literal text in document order", () => {
    const content = {
      version: 1 as const,
      parts: [
        { type: "text" as const, text: "Before\n" },
        {
          type: "image" as const,
          index: 0,
          src: "https://example.com/a.png",
          alt: "Diagram",
        },
        { type: "text" as const, text: "\nAfter" },
      ],
    };
    const { container } = render(
      <HighlightContent text="Fallback" content={content} />,
    );
    expect(container.querySelector("img")?.alt).toBe("Diagram");
    expect(container.firstElementChild?.children[0].textContent).toBe(
      "Before\n",
    );
    expect(container.firstElementChild?.children[2].textContent).toBe(
      "\nAfter",
    );
  });
  it("restores only the selected image and removes its marker on deletion", () => {
    const { container, rerender } = render(
      <BookmarkHTMLHighlighter
        htmlContent={html}
        highlights={[imageHighlight]}
      />,
    );
    expect(
      container.querySelectorAll('[data-highlight-id="image"] img'),
    ).toHaveLength(1);
    expect(
      container
        .querySelector('[data-highlight-id="image"] img')
        ?.getAttribute("alt"),
    ).toBe("Second");
    rerender(<BookmarkHTMLHighlighter htmlContent={html} highlights={[]} />);
    expect(container.querySelectorAll("[data-highlight]")).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.textContent).toBe("BeforeAfter");
  });

  it("preserves an overlapping highlight when one is deleted", () => {
    const other = { ...imageHighlight, id: "other", color: "green" as const };
    const { container, rerender } = render(
      <BookmarkHTMLHighlighter
        htmlContent={html}
        highlights={[imageHighlight, other]}
      />,
    );
    expect(container.querySelectorAll("[data-highlight]")).toHaveLength(2);
    rerender(
      <BookmarkHTMLHighlighter htmlContent={html} highlights={[other]} />,
    );
    expect(container.querySelector('[data-highlight-id="image"]')).toBeNull();
    expect(
      container.querySelector('[data-highlight-id="other"] img'),
    ).not.toBeNull();
  });

  it("keeps old text-offset highlights working without rich content", () => {
    const legacy = {
      id: "legacy",
      startOffset: 1,
      endOffset: 4,
      text: "efo",
      color: "yellow" as const,
    };
    const { container } = render(
      <BookmarkHTMLHighlighter htmlContent={html} highlights={[legacy]} />,
    );
    expect(
      container.querySelector('[data-highlight-id="legacy"]')?.textContent,
    ).toBe("efo");
    expect(container.querySelector("[data-highlight] img")).toBeNull();
  });
});
