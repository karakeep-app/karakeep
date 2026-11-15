// What the asset preprocessing worker shares with the two AssetProcessor
// implementations: the local one (localAssetProcessor.ts) and the client of a
// remote sandbox (remoteAssetProcessor.ts). An AssetProcessor does the work
// that parses the (untrusted) asset — reading a PDF's text, rendering its
// first page and OCR — and nothing that touches the database or the asset
// store.

export interface AssetJob {
  jobId: string;
  abortSignal: AbortSignal;
}

export interface PdfText {
  text: string;
  metadata: Record<string, unknown> | null;
}

export interface AssetProcessor {
  readPdfText(job: AssetJob, pdf: Buffer): Promise<PdfText>;
  /** Renders the PDF's first page as a PNG. */
  renderPdfScreenshot(job: AssetJob, pdf: Buffer): Promise<Buffer>;
  /**
   * Reads the image's text with Tesseract. Null when OCR is disabled or the
   * text isn't recognized confidently enough.
   */
  readImageText(job: AssetJob, image: Buffer): Promise<string | null>;
}
