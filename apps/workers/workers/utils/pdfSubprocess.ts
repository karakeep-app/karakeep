// Runs PDF text extraction in a separate node process. Parsing is CPU-bound and
// would otherwise hog the event loop shared by every worker in this process, and
// it can't observe the job's abort signal: a timed-out parse would keep running
// (and pile up with its own retries) unless the process is killed.
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";

import serverConfig from "@karakeep/shared/config";
import { tryCatch } from "@karakeep/shared/tryCatch";

import { parsePdfSubprocessOutputSchema } from "./parsePdfSubprocessIpc";
import { getScriptCommand } from "./subprocessScript";

export async function runPdfParseSubprocess(
  pdf: Buffer,
  jobId: string,
  abortSignal: AbortSignal,
): Promise<{ text: string; metadata: Record<string, unknown> | null }> {
  const memLimitMb = serverConfig.assetPreprocessing.pdfParserMemLimitMb;
  const { cmd, args } = getScriptCommand("parsePdfSubprocess", memLimitMb);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "karakeep-pdf-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.json");
  try {
    await fs.writeFile(pdfPath, pdf);
    const result = await execa({
      input: JSON.stringify({ pdfPath, outputPath }),
      cancelSignal: abortSignal,
      timeout: serverConfig.assetPreprocessing.jobTimeoutSec * 1000,
      reject: false,
      // The subprocess parses untrusted files and needs nothing from the
      // environment, so it doesn't get the worker's secrets (API keys, storage
      // credentials, ...). PATH is only there for dev mode to find tsx.
      extendEnv: false,
      env: { PATH: process.env.PATH },
      // The result comes back through `outputPath`; nobody reads stdout.
      stdout: "ignore",
      // pdf.js warns on every load that the canvas it only needs for rendering
      // is missing, so stderr is only surfaced when the subprocess fails.
      stderr: "pipe",
    })(cmd, args);

    if (result.isCanceled) {
      throw new Error(
        `[assetPreprocessing][${jobId}] PDF parse subprocess was cancelled (job aborted)`,
      );
    }
    if (result.timedOut) {
      throw new Error(
        `[assetPreprocessing][${jobId}] PDF parse subprocess timed out. Consider increasing ASSET_PREPROCESSING_JOB_TIMEOUT_SEC (currently ${serverConfig.assetPreprocessing.jobTimeoutSec}s).`,
      );
    }
    if (result.exitCode !== 0) {
      // SIGKILL (137) from the OS OOM killer, SIGABRT (134) from V8 running out
      // of heap. The exit codes show up when a wrapper (tsx in dev) relays them.
      const isOom =
        result.exitCode === 137 ||
        result.exitCode === 134 ||
        result.signal === "SIGKILL" ||
        result.signal === "SIGABRT";
      const reason = isOom
        ? `ran out of memory. Consider increasing ASSET_PREPROCESSING_PDF_PARSER_MEM_LIMIT_MB (currently ${memLimitMb}MB).`
        : `exited with code ${result.exitCode}${result.signal ? ` (signal: ${result.signal})` : ""}`;
      const stderr = result.stderr?.trim().slice(-2000);
      throw new Error(
        `[assetPreprocessing][${jobId}] PDF parse subprocess ${reason}${stderr ? `\n${stderr}` : ""}`,
      );
    }

    const output = parsePdfSubprocessOutputSchema.parse(
      JSON.parse(await fs.readFile(outputPath, "utf8")),
    );
    if (!output.ok) {
      throw new Error(
        `[assetPreprocessing][${jobId}] Failed to parse PDF: ${output.error}`,
      );
    }
    return { text: output.text, metadata: output.metadata };
  } finally {
    await tryCatch(fs.rm(tmpDir, { recursive: true, force: true }));
  }
}
