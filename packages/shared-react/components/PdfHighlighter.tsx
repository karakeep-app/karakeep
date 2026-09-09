import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { GlobalWorkerOptions, getDocument, TextLayer } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { SUPPORTED_HIGHLIGHT_COLORS } from "@karakeep/shared/types/highlights";
import type {
  ZHighlight,
  ZHighlightColor,
  ZPdfHighlightMetadata,
} from "@karakeep/shared/types/highlights";

import { pdfHighlightMetadataFromSelection } from "./pdf-highlight-utils";
import type { PdfClientRect, PdfPageBounds } from "./pdf-highlight-utils";

const HIGHLIGHT_COLORS: Record<ZHighlightColor, string> = {
  yellow: "rgba(253, 224, 71, 0.55)",
  red: "rgba(252, 165, 165, 0.55)",
  green: "rgba(134, 239, 172, 0.55)",
  blue: "rgba(147, 197, 253, 0.55)",
};

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export interface PdfHighlightInput {
  startOffset: number;
  endOffset: number;
  color: ZHighlightColor;
  text: string | null;
  note: string | null;
  pdf: ZPdfHighlightMetadata;
}

interface PdfHighlighterProps {
  source: string;
  headers?: Record<string, string>;
  highlights?: ZHighlight[];
  readOnly?: boolean;
  className?: string;
  onHighlight?: (highlight: PdfHighlightInput) => void;
  onUpdateHighlight?: (highlight: ZHighlight) => void;
  onDeleteHighlight?: (highlight: ZHighlight) => void;
}

interface SelectionState {
  text: string;
  pdf: ZPdfHighlightMetadata;
  position: { x: number; y: number };
}

function pageBoundsFromElement(element: Element): PdfPageBounds | null {
  const pageIndex = Number(element.getAttribute("data-pdf-page"));
  const rect = element.getBoundingClientRect();
  if (!Number.isInteger(pageIndex) || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    pageIndex,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function clientRectFromDomRect(rect: DOMRect): PdfClientRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function PdfHighlightEditor({
  position,
  selectedHighlight,
  pendingSelection,
  onClose,
  onSave,
  onDelete,
}: {
  position: { x: number; y: number } | null;
  selectedHighlight: ZHighlight | null;
  pendingSelection: SelectionState | null;
  onClose: () => void;
  onSave: (color: ZHighlightColor, note: string | null) => void;
  onDelete: (() => void) | undefined;
}) {
  const active = selectedHighlight ?? pendingSelection;
  const [color, setColor] = useState<ZHighlightColor>(
    selectedHighlight?.color ?? "yellow",
  );
  const [note, setNote] = useState(selectedHighlight?.note ?? "");

  useEffect(() => {
    setColor(selectedHighlight?.color ?? "yellow");
    setNote(selectedHighlight?.note ?? "");
  }, [selectedHighlight, pendingSelection]);

  if (!position || !active) {
    return null;
  }

  const left =
    typeof window === "undefined"
      ? position.x
      : Math.max(8, Math.min(position.x - 140, window.innerWidth - 288));
  const top =
    typeof window === "undefined"
      ? position.y
      : Math.max(8, Math.min(position.y, window.innerHeight - 190));

  return (
    <div
      role="dialog"
      aria-label="Highlight options"
      className="pdf-highlight-editor"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="pdf-highlight-editor__label">Color</div>
      <div className="pdf-highlight-editor__colors">
        {SUPPORTED_HIGHLIGHT_COLORS.map((option) => (
          <button
            type="button"
            key={option}
            aria-label={`${option} highlight`}
            aria-pressed={color === option}
            className="pdf-highlight-editor__color"
            style={{ backgroundColor: HIGHLIGHT_COLORS[option] }}
            onClick={() => setColor(option)}
          >
            {color === option ? "✓" : ""}
          </button>
        ))}
      </div>
      <label className="pdf-highlight-editor__label" htmlFor="pdf-note">
        Note
      </label>
      <textarea
        id="pdf-note"
        className="pdf-highlight-editor__note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add a note (optional)..."
      />
      <div className="pdf-highlight-editor__actions">
        <button
          type="button"
          className="pdf-highlight-editor__save"
          onClick={() => onSave(color, note || null)}
        >
          Save
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        {selectedHighlight && onDelete && (
          <button
            type="button"
            className="pdf-highlight-editor__delete"
            onClick={onDelete}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function PdfPage({
  document,
  pageIndex,
  containerWidth,
  rootRef,
  highlights,
  onPointerUp,
  onHighlightClick,
}: {
  document: PDFDocumentProxy;
  pageIndex: number;
  containerWidth: number;
  rootRef: RefObject<HTMLDivElement | null>;
  highlights: ZHighlight[];
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onHighlightClick: (highlight: ZHighlight, event: MouseEvent) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function measurePage() {
      try {
        const page = await document.getPage(pageIndex + 1);
        if (disposed) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(containerWidth - 24, 320);
        const scale = Math.min(2, availableWidth / baseViewport.width);
        const viewport = page.getViewport({ scale });
        setPageSize({ width: viewport.width, height: viewport.height });
      } catch (error) {
        if (!disposed) {
          setPageError(
            error instanceof Error ? error.message : "Failed to render page",
          );
        }
      }
    }

    setPageSize(null);
    setPageError(null);
    setIsVisible(false);
    void measurePage();
    return () => {
      disposed = true;
    };
  }, [containerWidth, document, pageIndex]);

  useEffect(() => {
    const element = pageRef.current;
    if (!element || !pageSize) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setIsVisible(entries.some((entry) => entry.isIntersecting));
      },
      {
        root: rootRef.current,
        rootMargin: "768px 0px",
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [pageSize, rootRef]);

  useEffect(() => {
    if (!isVisible || !pageSize) {
      return;
    }
    const measuredPageSize = pageSize;

    let disposed = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | undefined;
    let textLayer: TextLayer | undefined;

    async function renderPage() {
      try {
        const page = await document.getPage(pageIndex + 1);
        if (disposed || !canvasRef.current || !textLayerRef.current) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: measuredPageSize.width / baseViewport.width,
        });
        const devicePixelRatio = Math.max(
          1,
          typeof window === "undefined" ? 1 : window.devicePixelRatio,
        );
        const canvas = canvasRef.current;
        canvas.width = Math.ceil(viewport.width * devicePixelRatio);
        canvas.height = Math.ceil(viewport.height * devicePixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          throw new Error("Canvas is unavailable");
        }

        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform:
            devicePixelRatio === 1
              ? undefined
              : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
        });
        await renderTask.promise;
        if (disposed) {
          return;
        }

        textLayerRef.current.replaceChildren();
        textLayerRef.current.style.width = `${viewport.width}px`;
        textLayerRef.current.style.height = `${viewport.height}px`;
        const textContent = await page.getTextContent();
        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerRef.current,
          viewport,
        });
        await textLayer.render();
      } catch (error) {
        if (!disposed) {
          setPageError(
            error instanceof Error ? error.message : "Failed to render page",
          );
        }
      }
    }

    setPageError(null);
    void renderPage();
    return () => {
      disposed = true;
      renderTask?.cancel();
      textLayer?.cancel();
      canvasRef.current
        ?.getContext("2d")
        ?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      textLayerRef.current?.replaceChildren();
    };
  }, [document, isVisible, pageIndex, pageSize]);

  const pageHighlights = useMemo(
    () =>
      highlights.flatMap((highlight) => {
        const page = highlight.pdf?.pages.find(
          (candidate) => candidate.pageIndex === pageIndex,
        );
        return page ? [{ highlight, page }] : [];
      }),
    [highlights, pageIndex],
  );

  return (
    <div
      ref={pageRef}
      data-pdf-page={pageIndex}
      className="pdf-highlight-page"
      style={{
        width: pageSize?.width ?? "100%",
        height: pageSize?.height ?? 240,
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div
        ref={textLayerRef}
        className="textLayer pdf-highlight-page__text-layer"
        onPointerUp={onPointerUp}
      />
      {pageHighlights.flatMap(({ highlight, page }) =>
        page.rects.map((rect, index) => (
          <button
            type="button"
            key={`${highlight.id}-${index}`}
            data-highlight-id={highlight.id}
            aria-label={`Open highlight: ${highlight.text ?? ""}`}
            className="pdf-highlight-overlay"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              backgroundColor: HIGHLIGHT_COLORS[highlight.color],
            }}
            onClick={(event) => onHighlightClick(highlight, event)}
          />
        )),
      )}
      {pageError && <div className="pdf-highlight-error">{pageError}</div>}
    </div>
  );
}

export default function PdfHighlighter({
  source,
  headers,
  highlights = [],
  readOnly = false,
  className,
  onHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: PdfHighlighterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] =
    useState<SelectionState | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState<ZHighlight | null>(
    null,
  );
  const headersKey = useMemo(() => JSON.stringify(headers ?? {}), [headers]);
  const stableHeaders = useMemo(() => {
    const parsed = JSON.parse(headersKey) as Record<string, string>;
    return Object.keys(parsed).length > 0 ? parsed : undefined;
  }, [headersKey]);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      setContainerWidth(containerRef.current?.clientWidth ?? 0);
    };
    updateWidth();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateWidth);
    observer?.observe(containerRef.current);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const loadingTask = getDocument({
      url: source,
      httpHeaders: stableHeaders,
    });

    setDocument(null);
    setLoadingError(null);
    void loadingTask.promise
      .then((loadedDocument) => {
        if (!disposed) setDocument(loadedDocument);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setLoadingError(
            error instanceof Error ? error.message : "Failed to load PDF",
          );
        }
      });

    return () => {
      disposed = true;
      void loadingTask.destroy();
    };
  }, [headersKey, source, stableHeaders]);

  const closeEditor = useCallback(() => {
    setPendingSelection(null);
    setSelectedHighlight(null);
    setMenuPosition(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (readOnly || !containerRef.current) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      if (
        !containerRef.current.contains(range.startContainer) ||
        !containerRef.current.contains(range.endContainer)
      ) {
        return;
      }

      const selectionRects = Array.from(range.getClientRects()).map(
        clientRectFromDomRect,
      );
      const pages = Array.from(
        containerRef.current.querySelectorAll("[data-pdf-page]"),
      )
        .map(pageBoundsFromElement)
        .filter((page): page is PdfPageBounds => page !== null);
      const pdf = pdfHighlightMetadataFromSelection(selectionRects, pages);
      const text = selection.toString();
      if (!pdf || !text.trim()) return;

      const bounds = range.getBoundingClientRect();
      setPendingSelection({
        text,
        pdf,
        position: {
          x: event.clientX || bounds.left + bounds.width / 2,
          y: event.clientY || bounds.bottom,
        },
      });
      setSelectedHighlight(null);
      setMenuPosition({
        x: event.clientX || bounds.left + bounds.width / 2,
        y: event.clientY || bounds.bottom,
      });
    },
    [readOnly],
  );

  const handleHighlightClick = useCallback(
    (highlight: ZHighlight, event: React.MouseEvent) => {
      if (readOnly) return;
      event.stopPropagation();
      setPendingSelection(null);
      setSelectedHighlight(highlight);
      setMenuPosition({ x: event.clientX, y: event.clientY });
    },
    [readOnly],
  );

  const handleSave = useCallback(
    (color: ZHighlightColor, note: string | null) => {
      if (pendingSelection) {
        onHighlight?.({
          startOffset: 0,
          endOffset: 0,
          color,
          text: pendingSelection.text,
          note,
          pdf: pendingSelection.pdf,
        });
      } else if (selectedHighlight) {
        onUpdateHighlight?.({
          ...selectedHighlight,
          color,
          note,
        });
      }
      closeEditor();
    },
    [
      closeEditor,
      onHighlight,
      onUpdateHighlight,
      pendingSelection,
      selectedHighlight,
    ],
  );

  const pdfHighlights = useMemo(
    () => highlights.filter((highlight) => highlight.pdf),
    [highlights],
  );

  return (
    <div
      ref={containerRef}
      className={`pdf-highlighter ${className ?? ""}`}
      onPointerDown={() => {
        if (pendingSelection || selectedHighlight) closeEditor();
      }}
    >
      <style>{`
        .pdf-highlighter { position: relative; height: 100%; width: 100%; overflow: auto; background: #525252; padding: 12px; }
        .pdf-highlight-page { position: relative; margin: 0 auto 16px; background: white; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
        .pdf-highlight-page canvas { display: block; }
        .pdf-highlight-page__text-layer { position: absolute; inset: 0; overflow: hidden; line-height: 1; opacity: 1; text-align: initial; transform-origin: 0 0; z-index: 1; }
        .pdf-highlight-page__text-layer :is(span, br) { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0 0; }
        .pdf-highlight-page__text-layer ::selection { background: rgba(37, 99, 235, .35); }
        .pdf-highlight-overlay { position: absolute; z-index: 2; border: 0; padding: 0; cursor: pointer; mix-blend-mode: multiply; }
        .pdf-highlight-editor { position: fixed; z-index: 20; width: 280px; border: 1px solid #d1d5db; border-radius: 8px; background: white; color: #111827; box-shadow: 0 8px 24px rgba(0,0,0,.18); padding: 10px; }
        .pdf-highlight-editor__label { margin: 0 0 5px; font-size: 12px; font-weight: 600; }
        .pdf-highlight-editor__colors { display: flex; gap: 6px; margin-bottom: 9px; }
        .pdf-highlight-editor__color { width: 28px; height: 28px; border: 1px solid #9ca3af; border-radius: 999px; cursor: pointer; }
        .pdf-highlight-editor__note { width: 100%; min-height: 60px; resize: vertical; border: 1px solid #d1d5db; border-radius: 5px; padding: 6px; font: inherit; font-size: 13px; }
        .pdf-highlight-editor__actions { display: flex; align-items: center; gap: 6px; margin-top: 9px; }
        .pdf-highlight-editor__actions button { border: 1px solid #d1d5db; border-radius: 5px; background: white; padding: 5px 8px; cursor: pointer; font-size: 12px; }
        .pdf-highlight-editor__actions .pdf-highlight-editor__save { border-color: #2563eb; background: #2563eb; color: white; }
        .pdf-highlight-editor__actions .pdf-highlight-editor__delete { margin-left: auto; color: #b91c1c; }
        .pdf-highlight-error { position: absolute; inset: 10px; color: #b91c1c; background: rgba(255,255,255,.9); padding: 10px; }
      `}</style>
      {loadingError && (
        <div className="pdf-highlight-error">{loadingError}</div>
      )}
      {!loadingError && !document && (
        <div className="pdf-highlight-error">Loading PDF…</div>
      )}
      {document &&
        Array.from({ length: document.numPages }, (_, pageIndex) => (
          <PdfPage
            key={`${source}-${pageIndex}`}
            document={document}
            pageIndex={pageIndex}
            containerWidth={containerWidth}
            rootRef={containerRef}
            highlights={pdfHighlights}
            onPointerUp={handlePointerUp}
            onHighlightClick={handleHighlightClick}
          />
        ))}
      {!readOnly && (
        <PdfHighlightEditor
          position={menuPosition}
          selectedHighlight={selectedHighlight}
          pendingSelection={pendingSelection}
          onClose={closeEditor}
          onSave={handleSave}
          onDelete={
            selectedHighlight && onDeleteHighlight
              ? () => {
                  onDeleteHighlight(selectedHighlight);
                  closeEditor();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
