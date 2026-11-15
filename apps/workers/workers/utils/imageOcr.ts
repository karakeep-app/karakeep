// Tesseract OCR for image assets.
import os from "node:os";

import serverConfig from "@karakeep/shared/config";

export async function readImageText(buffer: Buffer, abortSignal: AbortSignal) {
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
    const ret = await Promise.race([worker.recognize(buffer), aborted]);
    if (ret.data.confidence <= serverConfig.ocr.confidenceThreshold) {
      return null;
    }
    return ret.data.text;
  } finally {
    abortSignal.removeEventListener("abort", onAbort);
    await worker.terminate();
  }
}
