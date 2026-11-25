// Extracts the text of a PDF with pdf.js. It runs as its own process because
// parsing is CPU-bound and would starve the worker's event loop on large PDFs,
// and because the parent can only stop it by killing it.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { ParsePdfSubprocessOutput } from "../workers/utils/parsePdfSubprocessIpc";
import {
  parsePdfSubprocessInputSchema,
  parsePdfSubprocessOutputSchema,
} from "../workers/utils/parsePdfSubprocessIpc";

// pdf.js reads the predefined CMaps (needed to map CJK text to unicode) and the
// standard fonts from the files shipped in its package.
const pdfjsDir = path.dirname(
  createRequire(import.meta.url).resolve("pdfjs-dist/package.json"),
);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function parsePdf(
  data: Uint8Array,
): Promise<{ text: string; metadata: Record<string, unknown> | null }> {
  const loadingTask = getDocument({
    data,
    cMapUrl: path.join(pdfjsDir, "cmaps") + path.sep,
    standardFontDataUrl: path.join(pdfjsDir, "standard_fonts") + path.sep,
    // Only the text is needed: don't turn fonts into font faces for rendering.
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const doc = await loadingTask.promise;

    // getTextContent only walks the text operators of each page. Unlike
    // rendering it never decodes images, which is where the time goes on
    // scanned books.
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : "") : "",
          )
          .join(""),
      );
      page.cleanup();
    }

    const { info } = await doc.getMetadata();
    return {
      text: pages.join("\n\n").trim(),
      metadata: (info as Record<string, unknown> | undefined) ?? null,
    };
  } finally {
    await loadingTask.destroy();
  }
}

async function main() {
  const input = parsePdfSubprocessInputSchema.parse(
    JSON.parse(await readStdin()),
  );

  let output: ParsePdfSubprocessOutput;
  try {
    const parsed = await parsePdf(
      new Uint8Array(await readFile(input.pdfPath)),
    );
    output = { ok: true, ...parsed };
  } catch (err) {
    output = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await writeFile(
    input.outputPath,
    JSON.stringify(parsePdfSubprocessOutputSchema.parse(output)),
    "utf8",
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
