// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PdfViewerProps } from "@karakeep/shared-react/components/PdfViewer";

vi.mock("pdfjs-dist", () => ({
  getDocument: () => ({
    destroy: vi.fn(),
    promise: Promise.resolve({
      numPages: 2,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({
          width: 300 * scale,
          height: 400 * scale,
          convertToPdfPoint: (x: number, y: number) => [
            x / scale,
            400 - y / scale,
          ],
          convertToViewportRectangle: ([x1, y1, x2, y2]: number[]) => [
            x1 * scale,
            (400 - y1) * scale,
            x2 * scale,
            (400 - y2) * scale,
          ],
        }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({
          items: [{ str: "Selected PDF passage" }],
        }),
      }),
    }),
  }),
  TextLayer: class {
    constructor(private options: { container: HTMLElement }) {}
    render() {
      this.options.container.innerHTML = "<span>Selected PDF passage</span>";
      return Promise.resolve();
    }
    cancel() {
      // This fixture renders synchronously, so no work remains to cancel.
    }
  },
}));
vi.mock("@karakeep/shared-react/components/BookmarkHtmlHighlighter", () => ({
  HighlightForm: ({
    position,
    selectedHighlight,
    onSave,
    onClose,
  }: {
    position: unknown;
    selectedHighlight: { text: string };
    onSave: (c: string, n: string) => void;
    onClose: () => void;
  }) =>
    position ? (
      <section aria-label="Selection editor">
        <p>{selectedHighlight.text}</p>
        <button onClick={() => onSave("blue", "My note")}>
          Save test highlight
        </button>
        <button onClick={onClose}>Cancel test highlight</button>
      </section>
    ) : null,
}));
import PdfViewer from "@karakeep/shared-react/components/PdfViewer";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true }),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        // The test supplies a fixed viewport width.
      }
      disconnect() {
        // The fixed-width fixture does not register observers.
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 300, 400),
  );
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [new DOMRect(10, 20, 100, 12)],
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function props(overrides: Partial<PdfViewerProps> = {}): PdfViewerProps {
  return {
    assetId: "pdf-a",
    source: "/a.pdf",
    highlights: [],
    onCreate: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
async function select(container: HTMLElement) {
  await waitFor(() =>
    expect(screen.getByLabelText("PDF viewer").getAttribute("aria-busy")).toBe(
      "false",
    ),
  );
  await waitFor(() =>
    expect(
      container.querySelector('[role="presentation"] span'),
    ).not.toBeNull(),
  );
  const text = container.querySelector(
    '[role="presentation"] span',
  )!.firstChild!;
  const range = document.createRange();
  range.selectNodeContents(text);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  fireEvent(document, new Event("selectionchange"));
}

test("touch selection handles can change the range before the explicit editor action", async () => {
  const p = props();
  const view = render(<PdfViewer {...p} />);
  await select(view.container);
  expect(screen.queryByRole("region", { name: "Selection editor" })).toBeNull();
  const action = screen.getByRole("button", {
    name: "Highlight selected text",
  });
  expect(action.hasAttribute("disabled")).toBe(false);
  fireEvent.pointerDown(action);
  expect(screen.getByRole("region", { name: "Selection editor" })).toBeTruthy();
  expect(window.getSelection()?.rangeCount).toBe(0);
  fireEvent.click(screen.getByText("Save test highlight"));
  await waitFor(() => expect(p.onCreate).toHaveBeenCalledTimes(1));
  expect(p.onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      text: "Selected PDF passage",
      color: "blue",
      note: "My note",
      pdfAnchor: {
        version: 1,
        assetId: "pdf-a",
        rects: [expect.objectContaining({ pageIndex: 0 })],
      },
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("region", { name: "Selection editor" }),
    ).toBeNull(),
  );
});

test("a rejected native bridge mutation preserves the selected text and allows retry", async () => {
  const onCreate = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const view = render(<PdfViewer {...props({ onCreate })} />);
  await select(view.container);
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Highlight selected text" }),
  );
  fireEvent.click(screen.getByText("Save test highlight"));
  await screen.findByRole("alert");
  expect(
    screen.getByRole("region", { name: "Selection editor" }).textContent,
  ).toContain("Selected PDF passage");
  fireEvent.click(screen.getByText("Save test highlight"));
  await waitFor(() =>
    expect(
      screen.queryByRole("region", { name: "Selection editor" }),
    ).toBeNull(),
  );
  expect(onCreate).toHaveBeenCalledTimes(2);
});

test("rapid taps create only one highlight while the asynchronous bridge is pending", async () => {
  let finish!: () => void;
  const onCreate = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<PdfViewer {...props({ onCreate })} />);
  await select(view.container);
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Highlight selected text" }),
  );
  const save = screen.getByText("Save test highlight");
  fireEvent.click(save);
  fireEvent.click(save);
  expect(onCreate).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
  });
  expect(screen.queryByRole("region", { name: "Selection editor" })).toBeNull();
});

test("read-only PDF selections expose no mutation controls", async () => {
  const p = props({ readOnly: true });
  const view = render(<PdfViewer {...p} />);
  await select(view.container);
  expect(
    screen.queryByRole("button", { name: "Highlight selected text" }),
  ).toBeNull();
  expect(screen.queryByRole("region", { name: "Selection editor" })).toBeNull();
  expect(p.onCreate).not.toHaveBeenCalled();
});

test("selection outside the PDF cannot enable the highlight action", async () => {
  const view = render(
    <>
      <p data-testid="outside">Unrelated page text</p>
      <PdfViewer {...props()} />
    </>,
  );
  await select(view.container);
  const range = document.createRange();
  range.selectNodeContents(screen.getByTestId("outside"));
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  fireEvent(document, new Event("selectionchange"));
  expect(
    screen
      .getByRole("button", { name: "Highlight selected text" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

test("changing pages discards the previous touch selection and anchors the next selection to its page", async () => {
  const p = props();
  const view = render(<PdfViewer {...p} />);
  await select(view.container);
  fireEvent.click(screen.getByRole("button", { name: "Next PDF page" }));
  await waitFor(() =>
    expect(screen.getByLabelText("PDF viewer").getAttribute("aria-busy")).toBe(
      "false",
    ),
  );
  expect(
    screen
      .getByRole("button", { name: "Highlight selected text" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await select(view.container);
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Highlight selected text" }),
  );
  fireEvent.click(screen.getByText("Save test highlight"));
  await waitFor(() =>
    expect(p.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfAnchor: {
          version: 1,
          assetId: "pdf-a",
          rects: [expect.objectContaining({ pageIndex: 1 })],
        },
      }),
    ),
  );
});

test("a late save failure from the previous PDF does not contaminate a different document", async () => {
  let reject!: (error: Error) => void;
  const onCreate = vi.fn(
    () =>
      new Promise<void>((_resolve, failure) => {
        reject = failure;
      }),
  );
  const p = props({ onCreate });
  const view = render(<PdfViewer {...p} />);
  await select(view.container);
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Highlight selected text" }),
  );
  fireEvent.click(screen.getByText("Save test highlight"));
  view.rerender(<PdfViewer {...p} source="/b.pdf" assetId="pdf-b" />);
  await act(async () => {
    reject(new Error("Old document failed"));
  });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("region", { name: "Selection editor" })).toBeNull();
  await select(view.container);
  expect(
    screen
      .getByRole("button", { name: "Highlight selected text" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
