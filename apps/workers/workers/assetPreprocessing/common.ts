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

/**
 * The AssetProcessor couldn't do the work, e.g. the remote sandbox is
 * unreachable. Unlike the asset failing to parse, it says nothing about the
 * asset, so the job must fail (and be retried) rather than skip the step.
 */
export class AssetProcessorUnavailableError extends Error {}

/** A step's result, or why it failed. */
export type StepResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface PdfSteps {
  /** Extract the PDF's text. */
  text: boolean;
  /** Render its first page as a PNG. */
  screenshot: boolean;
}

/** The result of each step that was requested. */
export interface PdfResult {
  text?: StepResult<PdfText>;
  screenshot?: StepResult<Buffer>;
}

export interface AssetProcessor {
  /**
   * Runs the requested steps on the PDF, all in one go so that a remote
   * sandbox gets the PDF only once. A step failing doesn't stop the other
   * one, and is reported in its result. Throws only when the processor
   * couldn't run (AssetProcessorUnavailableError) or the job was aborted.
   */
  processPdf(job: AssetJob, pdf: Buffer, steps: PdfSteps): Promise<PdfResult>;
  /**
   * Reads the image's text with Tesseract. Null when OCR is disabled or the
   * text isn't recognized confidently enough.
   */
  readImageText(job: AssetJob, image: Buffer): Promise<string | null>;
}
