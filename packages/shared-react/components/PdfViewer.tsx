"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "./ui/button";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { getDocument, TextLayer } from "pdfjs-dist";
import type { PDFDocumentProxy, PageViewport, RenderTask } from "pdfjs-dist";

import { HighlightForm } from "./BookmarkHtmlHighlighter";
import type { Highlight } from "./BookmarkHtmlHighlighter";
import { HIGHLIGHT_COLOR_MAP } from "./highlights";
import type { ZHighlightColor } from "@karakeep/shared/types/highlights";

import {
  pdfHighlightsForPage,
  pdfRectToViewport,
  selectionToPdfRects,
} from "./pdfHighlights";
import styles from "./PdfViewer.module.css";

export interface PdfViewerProps {
  assetId: string;
  source: string | Uint8Array;
  originalUrl?: string;
  readOnly?: boolean;
  highlights: Highlight[];
  requestedHighlight?: string | null;
  onNavigateHighlight?: () => void;
  onCreate: (highlight: Highlight) => Promise<unknown>;
  onUpdate: (highlight: Highlight) => Promise<unknown>;
  onDelete: (highlight: Highlight) => Promise<unknown>;
}

export default function PdfViewer({
  assetId,
  source,
  originalUrl,
  readOnly = false,
  highlights: allHighlights,
  requestedHighlight,
  onNavigateHighlight,
  onCreate,
  onUpdate,
  onDelete,
}: PdfViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [rendering, setRendering] = useState(true);
  const [renderedPage, setRenderedPage] = useState<{
    document: PDFDocumentProxy;
    number: number;
  } | null>(null);
  const pageReady =
    !rendering &&
    renderedPage?.document === pdf &&
    renderedPage.number === pageNumber;
  const [error, setError] = useState(false);
  const [noText, setNoText] = useState(false);
  const [pending, setPending] = useState<Highlight | null>(null);
  const [selected, setSelected] = useState<Highlight | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(pointer: coarse)").matches,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);
  const epochRef = useRef(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [touchSelection, setTouchSelection] = useState<Highlight | null>(null);

  function closeForm() {
    setPending(null);
    setSelected(null);
    setPosition(null);
    setTouchSelection(null);
    window.getSelection()?.removeAllRanges();
  }
  useEffect(() => {
    let cancelled = false;
    epochRef.current++;
    setSaveError(null);
    setPdf(null);
    setError(false);
    setPageNumber(1);
    setViewport(null);
    closeForm();
    const task = getDocument(
      typeof source === "string" ? { url: source } : { data: source.slice() },
    );
    task.promise
      .then((document) => {
        if (!cancelled) setPdf(document);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      epochRef.current++;
      void task.destroy();
    };
  }, [source]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => setWidth(container.clientWidth));
    observer.observe(container);
    setWidth(container.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !textRef.current) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    const canvas = canvasRef.current;
    const textContainer = textRef.current;
    setRendering(true);
    setError(false);
    closeForm();
    textContainer.replaceChildren();
    async function renderPage() {
      const page = await pdf!.getPage(pageNumber);
      if (cancelled) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = (Math.max(200, width - 32) * zoom) / natural.width;
      const nextViewport = page.getViewport({ scale });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(nextViewport.width * pixelRatio);
      canvas.height = Math.ceil(nextViewport.height * pixelRatio);
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;
      setViewport(nextViewport);
      textContainer.style.setProperty("--scale-factor", `${scale}`);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      renderTask = page.render({
        canvasContext: context,
        viewport: nextViewport,
        transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      // Attach the render rejection handler immediately: changing pages can
      // cancel the canvas while the separate text-content request is pending.
      await Promise.all([
        renderTask.promise,
        (async () => {
          const text = await page.getTextContent();
          if (cancelled) return;
          textLayer = new TextLayer({
            textContentSource: text,
            container: textContainer,
            viewport: nextViewport,
          });
          await textLayer.render();
          if (!cancelled)
            setNoText(
              !text.items.some((item) => "str" in item && item.str.trim()),
            );
        })(),
      ]);
      if (cancelled) return;
      setRenderedPage({ document: pdf!, number: pageNumber });
      setRendering(false);
    }
    void renderPage().catch(() => {
      if (!cancelled) {
        setError(true);
        setRendering(false);
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, width, zoom]);

  const targetHighlight = allHighlights.find(
    (highlight) =>
      highlight.id === requestedHighlight &&
      highlight.pdfAnchor?.assetId === assetId,
  );
  const targetPage = targetHighlight?.pdfAnchor?.rects[0].pageIndex;
  useEffect(() => {
    if (pdf && targetPage !== undefined && targetPage < pdf.numPages) {
      setPageNumber(targetPage + 1);
    }
  }, [pdf, targetPage]);
  useEffect(() => {
    if (!pageReady || targetPage === undefined || pageNumber !== targetPage + 1)
      return;
    if (!scrollRef.current?.getBoundingClientRect().width) return;
    const target = Array.from(
      scrollRef.current?.querySelectorAll<HTMLElement>(
        "[data-pdf-highlight]",
      ) ?? [],
    ).find((element) => element.dataset.pdfHighlight === requestedHighlight);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    onNavigateHighlight?.();
  }, [
    pageReady,
    pageNumber,
    targetPage,
    requestedHighlight,
    onNavigateHighlight,
  ]);

  function readSelection(): Highlight | null {
    if (readOnly || !pageReady || !viewport || !textRef.current || saving)
      return null;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    const rects = selectionToPdfRects(
      selection.getRangeAt(0),
      textRef.current,
      viewport,
      pageNumber - 1,
    );
    const text = selection.toString();
    if (
      !rects.length ||
      !text.trim() ||
      rects.length > 512 ||
      text.length > 10000
    )
      return null;
    return {
      id: "NOT_SET",
      startOffset: 0,
      endOffset: 0,
      text,
      color: "yellow",
      note: null,
      pdfAnchor: { version: 1, assetId, rects },
    };
  }

  function openSelection(highlight = readSelection()) {
    if (!highlight || busyRef.current) return;
    const bounds = scrollRef.current?.getBoundingClientRect();
    setSelected(null);
    setPending(highlight);
    setSaveError(null);
    // The selection is captured above. Dismiss Android's floating selection
    // toolbar before it can cover the editor's color and note controls.
    window.getSelection()?.removeAllRanges();
    setTouchSelection(null);
    setPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 320) / 2,
      y: Math.max(72, (bounds?.top ?? 0) + 16),
    });
  }

  // Native touch handles update the selection after pointerup. Keep a snapshot,
  // and let the reader explicitly finish selecting before opening the editor.
  useEffect(() => {
    if (!isMobile || position) return;
    const changed = () => setTouchSelection(readSelection());
    document.addEventListener("selectionchange", changed);
    changed();
    return () => document.removeEventListener("selectionchange", changed);
  }, [
    isMobile,
    position,
    pageReady,
    viewport,
    pageNumber,
    assetId,
    readOnly,
    saving,
  ]);

  async function mutate(action: () => Promise<unknown>) {
    if (busyRef.current || readOnly) return;
    busyRef.current = true;
    setSaving(true);
    setSaveError(null);
    const epoch = epochRef.current;
    try {
      await action();
      if (epoch === epochRef.current) closeForm();
    } catch {
      if (epoch === epochRef.current)
        setSaveError("Could not save the highlight. Please try again.");
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  function save(color: ZHighlightColor, note: string | null) {
    if (pending) void mutate(() => onCreate({ ...pending, color, note }));
    else if (selected)
      void mutate(() => onUpdate({ ...selected, color, note }));
  }

  const highlights = pdfHighlightsForPage(
    allHighlights,
    assetId,
    pageNumber - 1,
  );
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      aria-label="PDF viewer"
      aria-busy={!pageReady}
    >
      <div className="flex flex-wrap items-center justify-center gap-2 border-b p-2">
        <Button
          size="sm"
          variant="outline"
          aria-label="Previous PDF page"
          disabled={!pdf || pageNumber <= 1}
          onClick={() => setPageNumber((n) => n - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <label className="flex items-center gap-1 text-sm">
          Page
          <input
            aria-label="PDF page"
            type="number"
            min={1}
            max={pdf?.numPages ?? 1}
            value={pageNumber}
            disabled={!pdf}
            className="w-14 rounded border bg-background p-1 text-center"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && pdf && n <= pdf.numPages)
                setPageNumber(n);
            }}
          />
          <span>of {pdf?.numPages ?? "..."}</span>
        </label>
        <Button
          size="sm"
          variant="outline"
          aria-label="Next PDF page"
          disabled={!pdf || pageNumber >= pdf.numPages}
          onClick={() => setPageNumber((n) => n + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        >
          <Minus className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setZoom(1)}>
          Fit width
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label="Zoom in"
          disabled={zoom >= 2}
          onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
        >
          <Plus className="size-4" />
        </Button>
        {originalUrl && (
          <a
            href={originalUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Open original PDF
          </a>
        )}
        {isMobile && !readOnly && (
          <Button
            size="sm"
            disabled={!touchSelection || saving}
            onPointerDown={(event) => {
              if (touchSelection) {
                event.preventDefault();
                openSelection(touchSelection);
              }
            }}
            onClick={() => openSelection(touchSelection)}
          >
            Highlight selected text
          </Button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-muted p-4"
      >
        {error ? (
          <p role="alert" className="p-4 text-center">
            Unable to display this PDF. You can open the original PDF above.
          </p>
        ) : !pdf ? (
          <p role="status" className="p-4 text-center">
            Loading PDF...
          </p>
        ) : null}
        <div
          className="relative mx-auto bg-white"
          style={{
            width: viewport?.width,
            height: viewport?.height,
            display: error ? "none" : undefined,
          }}
        >
          <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
          <div
            ref={textRef}
            className={styles.textLayer}
            role="presentation"
            onPointerDown={(event) => {
              if (event.pointerType === "touch" || event.pointerType === "pen")
                setIsMobile(true);
            }}
            onPointerUp={(event) => {
              if (event.pointerType === "mouse" && !isMobile) openSelection();
            }}
            onKeyUp={() => {
              if (!isMobile) openSelection();
            }}
          />
          {pageReady &&
            viewport &&
            highlights.flatMap((highlight) =>
              highlight
                .pdfAnchor!.rects.filter(
                  (rect) => rect.pageIndex === pageNumber - 1,
                )
                .map((rect, index) => (
                  <button
                    key={`${highlight.id}-${index}`}
                    type="button"
                    data-pdf-highlight={highlight.id}
                    aria-label={`Highlight: ${highlight.text ?? ""}`}
                    disabled={readOnly}
                    className={`absolute z-10 opacity-40 ${HIGHLIGHT_COLOR_MAP.bg[highlight.color]} ${readOnly ? "pointer-events-none" : "cursor-pointer"}`}
                    style={pdfRectToViewport(rect, viewport)}
                    onClick={(event) => {
                      if (saving) return;
                      setPending(null);
                      setSelected(highlight);
                      const bounds =
                        event.currentTarget.getBoundingClientRect();
                      setPosition({
                        x: bounds.left + bounds.width / 2,
                        y: bounds.top,
                      });
                    }}
                  />
                )),
            )}
        </div>
        {pdf && rendering && !error && (
          <p role="status" className="p-2 text-center text-sm">
            Loading page...
          </p>
        )}
        {noText && !rendering && !error && (
          <p className="p-2 text-center text-sm">
            This page has no selectable text.
          </p>
        )}
      </div>
      {saveError && (
        <p role="alert" className="p-2 text-center text-destructive">
          {saveError}
        </p>
      )}
      {saving && (
        <p role="status" className="p-2 text-center">
          Saving highlight...
        </p>
      )}
      {!readOnly && (
        <HighlightForm
          position={position}
          selectedHighlight={selected ?? pending}
          onClose={closeForm}
          onSave={save}
          isMobile={isMobile}
          onDelete={
            selected
              ? () => {
                  void mutate(() => onDelete(selected));
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
