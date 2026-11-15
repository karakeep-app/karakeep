// Parses assets on this machine. Used by the asset preprocessing worker, and
// by the remote sandbox on behalf of asset preprocessing workers configured
// with SANDBOX_REMOTE_URL.

import os from "os";

import serverConfig from "@karakeep/shared/config";

import type { AssetProcessor } from "./common";
import { runPdfParseSubprocess } from "../utils/pdfSubprocess";

export const localAssetProcessor: AssetProcessor = {
  readPdfText: (job, pdf) =>
    runPdfParseSubprocess(pdf, job.jobId, job.abortSignal),

  renderPdfScreenshot: async (_job, pdf) => {
    const { fromBuffer } = await import("pdf2pic");
    /**
     * If you encountered any issues with this library, make sure you have ghostscript and graphicsmagick installed following this URL
     * https://github.com/yakovmeister/pdf2image/blob/HEAD/docs/gm-installation.md
     */
    const screenshot = await fromBuffer(pdf, {
      density: 100,
      quality: 100,
      format: "png",
      preserveAspectRatio: true,
    })(1, { responseType: "buffer" });
    if (!screenshot.buffer) {
      throw new Error("pdf2pic didn't render the PDF's first page");
    }
    return screenshot.buffer;
  },

  readImageText: async ({ abortSignal }, image) => {
    if (serverConfig.ocr.langs.length == 1 && serverConfig.ocr.langs[0] == "") {
      return null;
    }
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(serverConfig.ocr.langs, undefined, {
      cachePath: serverConfig.ocr.cacheDir ?? os.tmpdir(),
    });
    // OCR runs in a worker thread that keeps going after the job times out.
    // terminate() (in the finally) stops it at once, but then recognize()'s
    // promise never settles, so it's raced against the abort.
    let onAbort: () => void = () => undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () =>
        reject(
          abortSignal.reason instanceof Error
            ? abortSignal.reason
            : new Error("Image OCR aborted"),
        );
      abortSignal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      // The signal may have fired while the worker was starting up.
      abortSignal.throwIfAborted();
      const ret = await Promise.race([worker.recognize(image), aborted]);
      if (ret.data.confidence <= serverConfig.ocr.confidenceThreshold) {
        return null;
      }
      return ret.data.text;
    } finally {
      abortSignal.removeEventListener("abort", onAbort);
      await worker.terminate();
    }
  },
};
