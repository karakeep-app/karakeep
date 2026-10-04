import React, { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
  TextLayer,
} from "pdfjs-dist";

import type {
  ZHighlight,
  ZHighlightColor,
  ZPdfHighlightLocation,
} from "@karakeep/shared/types/highlights";
import { SUPPORTED_HIGHLIGHT_COLORS } from "@karakeep/shared/types/highlights";

import { loadPdfRuntime } from "./pdf-runtime";
import { capturePdfSelection, toViewportRectangle } from "./pdf-selection";
import type { PDFPageGeometry } from "./pdf-selection";

export type PDFHighlight = Pick<
  ZHighlight,
  "id" | "color" | "text" | "note" | "pdfLocation"
>;
export interface NewPDFHighlight {
  text: string;
  color: ZHighlightColor;
  note: string | null;
  pdfLocation: ZPdfHighlightLocation;
}
type PDFSource = { url: string } | { base64: string };
const colors = {
  yellow: "#facc15",
  blue: "#60a5fa",
  green: "#4ade80",
  red: "#f87171",
};

function Page({
  pdf,
  pageNumber,
  scale,
  rotation,
  highlights,
  pages,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotation: number;
  highlights: PDFHighlight[];
  pages: Map<number, PDFPageGeometry>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [geometry, setGeometry] = useState<PDFPageGeometry | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "1000px" },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    let page: PDFPageProxy | undefined;
    setGeometry(null);
    setError(false);
    async function renderPage() {
      const pdfjs = await loadPdfRuntime();
      page = await pdf.getPage(pageNumber);
      if (cancelled || !canvas.current || !layer.current) return;
      const viewport = page.getViewport({
        scale,
        rotation: (page.rotate + rotation) % 360,
      });
      const element = layer.current;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.current.width = Math.floor(viewport.width * ratio);
      canvas.current.height = Math.floor(viewport.height * ratio);
      canvas.current.style.width = `${viewport.width}px`;
      canvas.current.style.height = `${viewport.height}px`;
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      element.style.setProperty("--scale-factor", String(scale));
      element.replaceChildren();
      const ctx = canvas.current.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      renderTask = page.render({
        canvasContext: ctx,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await renderTask.promise;
      if (cancelled) return;
      const textContent = await page.getTextContent();
      if (cancelled) return;
      textLayer = new pdfjs.TextLayer({
        textContentSource: textContent,
        container: element,
        viewport,
      });
      await textLayer.render();
      if (cancelled) return;
      const current = { element, viewport };
      pages.set(pageNumber, current);
      setGeometry(current);
    }
    void renderPage().catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
      pages.delete(pageNumber);
      renderTask?.cancel();
      textLayer?.cancel();
      page?.cleanup();
    };
  }, [pdf, pageNumber, scale, rotation, visible, pages]);

  return (
    <div
      ref={host}
      data-pdf-page={pageNumber}
      style={{
        position: "relative",
        margin: "16px auto",
        width: geometry?.viewport.width ?? 612 * scale,
        minHeight: geometry?.viewport.height ?? 792 * scale,
        background: "white",
        color: "black",
      }}
    >
      <canvas ref={canvas} style={{ display: "block" }} />
      <div ref={layer} className="karakeep-pdf-text" />
      {error && <p role="alert">Could not render page {pageNumber}.</p>}
      {geometry &&
        highlights.flatMap(
          (highlight) =>
            highlight.pdfLocation?.rects
              .filter((r) => r.page === pageNumber)
              .map((rect, index) => (
                <span
                  key={`${highlight.id}-${index}`}
                  data-highlight-id={highlight.id}
                  style={{
                    ...toViewportRectangle(rect, geometry.viewport),
                    position: "absolute",
                    background: colors[highlight.color],
                    opacity: 0.35,
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                />
              )) ?? [],
        )}
    </div>
  );
}

export default function BookmarkPdfHighlighter({
  source,
  assetId,
  highlights = [],
  readOnly = false,
  onCreate,
  onUpdate,
  onDelete,
}: {
  source: PDFSource;
  assetId: string;
  highlights?: PDFHighlight[];
  readOnly?: boolean;
  onCreate: (highlight: NewPDFHighlight) => Promise<void>;
  onUpdate: (
    highlightId: string,
    color: ZHighlightColor,
    note: string | null,
  ) => Promise<void>;
  onDelete: (highlightId: string) => Promise<void>;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [draft, setDraft] = useState<{
    text: string;
    pdfLocation: ZPdfHighlightLocation;
  } | null>(null);
  const [editing, setEditing] = useState<PDFHighlight | null>(null);
  const [color, setColor] = useState<ZHighlightColor>("yellow");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const pages = useRef(new Map<number, PDFPageGeometry>()).current;
  const root = useRef<HTMLDivElement>(null);
  const url = "url" in source ? source.url : undefined;
  const base64 = "base64" in source ? source.base64 : undefined;
  const relevant = highlights.filter((h) => h.pdfLocation?.assetId === assetId);

  useEffect(() => {
    let cancelled = false;
    let task:
      | ReturnType<Awaited<ReturnType<typeof loadPdfRuntime>>["getDocument"]>
      | undefined;
    setPdf(null);
    setError(null);
    setDraft(null);
    setEditing(null);
    pages.clear();
    void loadPdfRuntime()
      .then(async (pdfjs) => {
        if (cancelled) return;
        task = pdfjs.getDocument({
          ...(base64 !== undefined
            ? { data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) }
            : { url, withCredentials: true }),
          isEvalSupported: false,
          useWorkerFetch: false,
        });
        const document = await task.promise;
        const firstPage = await document.getPage(1);
        if (!cancelled) {
          setScale(
            Math.max(
              0.25,
              Math.min(
                1,
                ((root.current?.clientWidth ?? 636) - 24) /
                  firstPage.getViewport({ scale: 1 }).width,
              ),
            ),
          );
          setRotation(0);
          setPdf(document);
        }
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Could not open this PDF. It may be unavailable, damaged or password protected.",
          );
      });
    return () => {
      cancelled = true;
      pages.clear();
      void task?.destroy();
    };
  }, [url, base64, assetId, pages]);

  useEffect(() => {
    if (readOnly) return;
    const capture = () => {
      const selected = capturePdfSelection(
        window.getSelection(),
        pages,
        assetId,
      );
      if (selected) {
        setDraft(selected);
        setEditing(null);
      }
    };
    // selectionchange also captures Android/iOS native selection-handle changes.
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  }, [assetId, pages, readOnly]);

  function close() {
    setDraft(null);
    setEditing(null);
    setNote("");
    window.getSelection()?.removeAllRanges();
  }
  async function save(remove = false) {
    if (readOnly || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (remove && editing) await onDelete(editing.id);
      else if (editing) await onUpdate(editing.id, color, note || null);
      else if (draft) await onCreate({ ...draft, color, note: note || null });
      close();
    } catch {
      setError("Could not save the highlight. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={root}
      className="karakeep-pdf-viewer"
      style={{
        height: "100%",
        width: "100%",
        overflow: "auto",
        background: "#e5e7eb",
        color: "#111827",
      }}
    >
      <style>{`.karakeep-pdf-text{position:absolute;inset:0;overflow:hidden;line-height:1;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;z-index:2;user-select:text;-webkit-user-select:text}.karakeep-pdf-text :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0 0}.karakeep-pdf-text ::selection{background:#3b82f660}.karakeep-pdf-viewer button,.karakeep-pdf-viewer select,.karakeep-pdf-viewer textarea{font:inherit;padding:8px;border:1px solid #9ca3af;border-radius:4px;background:white;color:#111827}.karakeep-pdf-viewer button:disabled{opacity:.5}.karakeep-pdf-toolbar{position:sticky;top:0;left:0;z-index:4;background:#f9fafb;padding:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}`}</style>
      <div className="karakeep-pdf-toolbar">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={scale <= 0.25}
          onClick={() => {
            close();
            setScale((s) => Math.max(0.25, s - 0.25));
          }}
        >
          −
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={scale >= 3}
          onClick={() => {
            close();
            setScale((s) => Math.min(3, s + 0.25));
          }}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            setRotation((r) => (r + 90) % 360);
          }}
        >
          Rotate
        </button>
        <details>
          <summary>Saved highlights ({relevant.length})</summary>
          {relevant.map((h) => (
            <button
              key={h.id}
              type="button"
              style={{ display: "block", maxWidth: 320, textAlign: "left" }}
              onClick={() => {
                const target =
                  root.current?.querySelector(
                    `[data-highlight-id="${CSS.escape(h.id)}"]`,
                  ) ??
                  root.current?.querySelector(
                    `[data-pdf-page="${h.pdfLocation?.rects[0].page}"]`,
                  );
                target?.scrollIntoView({ block: "center" });
                if (!readOnly) {
                  setEditing(h);
                  setDraft(null);
                  setColor(h.color);
                  setNote(h.note ?? "");
                }
              }}
            >
              Page {h.pdfLocation?.rects[0].page}: {h.text}
            </button>
          ))}
        </details>
      </div>
      {error && (
        <p role="alert" style={{ padding: 12 }}>
          {error}
        </p>
      )}
      {!pdf && !error && <p role="status">Loading PDF…</p>}
      {pdf &&
        Array.from({ length: pdf.numPages }, (_, i) => (
          <Page
            key={`${assetId}-${i}`}
            pdf={pdf}
            pageNumber={i + 1}
            scale={scale}
            rotation={rotation}
            highlights={relevant}
            pages={pages}
          />
        ))}
      {!readOnly && (draft || editing) && (
        <form
          aria-label="PDF highlight"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          style={{
            position: "sticky",
            bottom: 0,
            left: 0,
            zIndex: 5,
            background: "#f9fafb",
            padding: 12,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <label>
            Color{" "}
            <select
              aria-label="Highlight color"
              value={color}
              onChange={(e) => setColor(e.target.value as ZHighlightColor)}
            >
              {SUPPORTED_HIGHLIGHT_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note{" "}
            <textarea
              aria-label="Highlight note"
              rows={1}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button type="submit" disabled={saving}>
            Save highlight
          </button>
          <button type="button" disabled={saving} onClick={close}>
            Cancel
          </button>
          {editing && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(true)}
            >
              Delete highlight
            </button>
          )}
        </form>
      )}
    </div>
  );
}
