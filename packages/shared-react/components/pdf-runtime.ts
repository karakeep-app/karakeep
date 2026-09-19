// oxlint-disable-next-line typescript-eslint/triple-slash-reference -- Include the ambient worker declaration in both web and Expo TypeScript projects.
/// <reference path="./pdf-worker.d.ts" />
import * as PDFJS from "pdfjs-dist";
import * as worker from "pdfjs-dist/build/pdf.worker.mjs";

export function loadPdfRuntime(): Promise<typeof PDFJS> {
  // Expo DOM and the web bundle both include the parser locally. PDF.js's
  // supported main-thread worker avoids a CDN and WebView worker URL/CORS
  // dependencies. Only visible pages are rasterized by the viewer.
  (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker =
    worker;
  return Promise.resolve(PDFJS);
}
