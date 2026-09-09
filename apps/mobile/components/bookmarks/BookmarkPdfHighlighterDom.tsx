"use dom";

import "@/globals.css";
import { useMemo } from "react";
import * as pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs";
import SharedPdfViewer from "@karakeep/shared-react/components/PdfViewer";
import type { Highlight } from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";

// Metro embeds this module in the DOM bundle. PDF.js runs its bundled worker
// handler locally; no CDN code or native credentials enter this document.
(
  globalThis as typeof globalThis & { pdfjsWorker: typeof pdfWorker }
).pdfjsWorker = pdfWorker;

export default function BookmarkPdfHighlighterDom({
  pdfBase64,
  assetId,
  highlights,
  isDark,
  readOnly,
  requestedHighlight,
  onCreate,
  onUpdate,
  onDelete,
}: {
  pdfBase64: string;
  assetId: string;
  highlights: Highlight[];
  isDark: boolean;
  readOnly?: boolean;
  requestedHighlight?: string;
  onCreate: (highlight: Highlight) => Promise<void>;
  onUpdate: (highlight: Highlight) => Promise<void>;
  onDelete: (highlight: Highlight) => Promise<void>;
  dom?: import("expo/dom").DOMProps;
}) {
  const bytes = useMemo(
    () => Uint8Array.from(atob(pdfBase64), (char) => char.charCodeAt(0)),
    [pdfBase64],
  );
  return (
    <div
      className={
        isDark
          ? "dark bg-background text-foreground"
          : "bg-background text-foreground"
      }
      style={{ height: "100vh", overflow: "hidden" }}
    >
      <SharedPdfViewer
        assetId={assetId}
        source={bytes}
        highlights={highlights}
        readOnly={readOnly}
        requestedHighlight={requestedHighlight}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </div>
  );
}
