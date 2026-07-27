import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { normalizePdfTitleCandidate } from "@karakeep/shared/utils/pdfTitle";

/**
 * Extract the first outline (bookmark) title from a PDF. LaTeX/hyperref often
 * puts the paper title here while leaving the info dictionary /Title empty.
 */
export async function extractPdfOutlineTitle(
  buffer: Buffer,
): Promise<string | null> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    // Workers are unnecessary for a one-shot metadata read in Node.
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
  });

  const doc = await loadingTask.promise;
  try {
    const outline = await doc.getOutline();
    if (!outline || outline.length === 0) {
      return null;
    }
    return normalizePdfTitleCandidate(outline[0]?.title);
  } finally {
    await doc.destroy();
  }
}
