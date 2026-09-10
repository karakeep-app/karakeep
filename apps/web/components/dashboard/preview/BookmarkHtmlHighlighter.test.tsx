// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Highlight as BookmarkHighlight } from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";

// Keep the real highlight editor, but omit portal positioning/focus behavior:
// jsdom cannot exercise the browser layout used by Radix's floating layer.
vi.mock("@radix-ui/react-popover", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@radix-ui/react-popover")>();
  const { forwardRef } = await import("react");
  const Anchor = forwardRef<HTMLSpanElement>((_, ref) => <span ref={ref} />);
  return {
    ...original,
    Root: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <>{children}</> : null,
    Anchor,
    PopoverAnchor: Anchor,
    Content: forwardRef<HTMLDivElement, { children: React.ReactNode }>(
      ({ children }, ref) => <div ref={ref}>{children}</div>,
    ),
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// jsdom has no paint/layout engine or CSS Highlight API. These tests verify
// DOM integrity, saved offsets, registry ownership and editor interactions.
class NativeHighlight extends Set<Range> {
  priority = 0;

  constructor(...ranges: Range[]) {
    super(ranges);
  }
}

const registry = new Map<string, NativeHighlight>();
const formula =
  '<math xmlns="http://www.w3.org/1998/Math/MathML"><msubsup><mi>W</mi><mrow><mi>e</mi><mi>n</mi><mi>c</mi></mrow><mi>ℓ</mi></msubsup></math>';

function highlight(
  overrides: Partial<BookmarkHighlight> = {},
): BookmarkHighlight {
  return {
    id: "saved-highlight",
    startOffset: 0,
    endOffset: 1,
    text: "W",
    color: "yellow",
    ...overrides,
  };
}

function nativeText() {
  return Array.from(registry.values()).flatMap((entry) =>
    Array.from(entry, (range) => range.toString()),
  );
}

beforeEach(() => {
  registry.clear();
  vi.stubGlobal("CSS", { highlights: registry });
  vi.stubGlobal("Highlight", NativeHighlight);
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: vi.fn(() => []),
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => new DOMRect(10, 20, 30, 40)),
  });
});

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MathML highlights", () => {
  it("keeps MathML markup intact when restoring a saved highlight", () => {
    const { container } = render(
      <BookmarkHTMLHighlighter
        htmlContent={formula}
        highlights={[highlight()]}
      />,
    );

    expect(container.querySelector("math")?.outerHTML).toBe(formula);
    expect(container.querySelector("math span")).toBeNull();
    expect(nativeText()).toEqual(["W"]);
    expect(container.querySelector("style")?.textContent).toContain("#fef08a");
  });

  it("preserves partial math token offsets without splitting its text node", () => {
    const html = "<math><mn>1234</mn></math>";
    const { container } = render(
      <BookmarkHTMLHighlighter
        htmlContent={html}
        highlights={[highlight({ startOffset: 1, endOffset: 3, text: "23" })]}
      />,
    );

    const token = container.querySelector("mn")!;
    expect(token.childNodes).toHaveLength(1);
    expect(token.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(token.textContent).toBe("1234");
    expect(nativeText()).toEqual(["23"]);
    const range = Array.from(registry.values())[0].values().next().value!;
    expect(range.startOffset).toBe(1);
    expect(range.endOffset).toBe(3);
  });

  it("restores mixed prose and math without changing text offsets", () => {
    const html = `<p>Before ${formula} after</p>`;
    const { container } = render(
      <BookmarkHTMLHighlighter
        htmlContent={html}
        highlights={[
          highlight({ startOffset: 4, endOffset: 15, text: "re Wencℓ af" }),
        ]}
      />,
    );

    expect(container.querySelector("p")?.textContent).toBe(
      "Before Wencℓ after",
    );
    expect(container.querySelector("math")?.outerHTML).toBe(formula);
    expect(nativeText()).toEqual(["W", "e", "n", "c", "ℓ"]);
    expect(
      Array.from(
        container.querySelectorAll("span[data-highlight]"),
        (el) => el.textContent,
      ),
    ).toEqual(["re ", " af"]);
  });

  it("recolors and removes saved math highlights without leaving registrations", () => {
    const view = render(
      <BookmarkHTMLHighlighter
        htmlContent={formula}
        highlights={[highlight()]}
      />,
    );

    view.rerender(
      <BookmarkHTMLHighlighter
        htmlContent={formula}
        highlights={[highlight({ color: "blue" })]}
      />,
    );
    expect(registry.size).toBe(1);
    expect(view.container.querySelector("style")?.textContent).toContain(
      "#bfdbfe",
    );
    expect(view.container.querySelector("style")?.textContent).not.toContain(
      "#fef08a",
    );
    expect(view.container.querySelector("math")?.outerHTML).toBe(formula);

    view.rerender(
      <BookmarkHTMLHighlighter htmlContent={formula} highlights={[]} />,
    );
    expect(registry.size).toBe(0);
    expect(view.container.querySelector("style")?.textContent).toBe("");
    expect(view.container.querySelector("math")?.outerHTML).toBe(formula);
  });

  it("keeps registrations separate between readers and cleans up on unmount", () => {
    const externalHighlight = new NativeHighlight();
    registry.set("another-application", externalHighlight);
    const first = render(
      <BookmarkHTMLHighlighter
        htmlContent={formula}
        highlights={[highlight()]}
      />,
    );
    const second = render(
      <BookmarkHTMLHighlighter
        htmlContent={formula}
        highlights={[highlight()]}
      />,
    );
    expect(registry.size).toBe(3);

    first.unmount();
    expect(registry.size).toBe(2);
    expect(nativeText()).toEqual(["W"]);
    second.unmount();
    expect(Array.from(registry.entries())).toEqual([
      ["another-application", externalHighlight],
    ]);
  });

  it("opens the top overlapping math highlight for editing and deletion", () => {
    const onDeleteHighlight = vi.fn();
    const second = highlight({
      id: "second",
      color: "blue",
      note: "Top highlight",
    });
    const { container } = render(
      <BookmarkHTMLHighlighter
        htmlContent={formula}
        highlights={[highlight(), second]}
        onDeleteHighlight={onDeleteHighlight}
      />,
    );
    expect(Array.from(registry.values(), (entry) => entry.priority)).toEqual([
      0, 1,
    ]);
    vi.mocked(Range.prototype.getClientRects).mockReturnValue([
      new DOMRect(10, 20, 30, 40),
    ] as unknown as DOMRectList);

    fireEvent.pointerUp(container.querySelector("mi")!, {
      clientX: 15,
      clientY: 25,
    });
    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      "Top highlight",
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete highlight" }));
    expect(onDeleteHighlight).toHaveBeenCalledWith(second);
  });

  it("saves a user selection inside MathML and restores it by the same offsets", () => {
    const onHighlight = vi.fn();
    const html = "<p>Value: <math><mn>1234</mn></math>.</p>";
    const view = render(
      <BookmarkHTMLHighlighter htmlContent={html} onHighlight={onHighlight} />,
    );
    const token = view.container.querySelector("mn")!;
    const range = document.createRange();
    range.setStart(token.firstChild!, 1);
    range.setEnd(token.firstChild!, 3);
    window.getSelection()?.addRange(range);

    fireEvent.pointerUp(token, { clientX: 15, clientY: 25 });
    expect(window.getSelection()?.toString()).toBe("23");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onHighlight).toHaveBeenCalledWith(
      expect.objectContaining({
        startOffset: 8,
        endOffset: 10,
        text: "23",
        color: "yellow",
      }),
    );

    const saved = { ...onHighlight.mock.calls[0][0], id: "new-highlight" };
    view.rerender(
      <BookmarkHTMLHighlighter htmlContent={html} highlights={[saved]} />,
    );
    expect(nativeText()).toEqual(["23"]);
    expect(view.container.querySelector("mn")?.childNodes).toHaveLength(1);
  });

  it("does not open an editor in read-only mode", () => {
    const { container } = render(
      <BookmarkHTMLHighlighter
        htmlContent={formula}
        highlights={[highlight()]}
        readOnly
      />,
    );
    vi.mocked(Range.prototype.getClientRects).mockReturnValue([
      new DOMRect(10, 20, 30, 40),
    ] as unknown as DOMRectList);
    fireEvent.pointerUp(container.querySelector("mi")!, {
      clientX: 15,
      clientY: 25,
    });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(nativeText()).toEqual(["W"]);
  });

  it("retains the existing span fallback when the native API is unavailable", () => {
    vi.stubGlobal("CSS", undefined);
    vi.stubGlobal("Highlight", undefined);
    const { container } = render(
      <BookmarkHTMLHighlighter
        htmlContent="<p>Word</p>"
        highlights={[highlight()]}
      />,
    );
    expect(container.querySelector("span[data-highlight]")?.textContent).toBe(
      "W",
    );
    expect(registry.size).toBe(0);
  });
});
