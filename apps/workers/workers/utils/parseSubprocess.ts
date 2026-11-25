// Runs the HTML parsing (metadata extraction + Defuddle content extraction) in a separate
// node process with a bounded heap, so a pathological page can't OOM the
// worker itself.
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";

import { getTracer, withSpan } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { tryCatch } from "@karakeep/shared/tryCatch";

import type {
  ParseSubprocessError,
  ParseSubprocessOutput,
} from "./parseHtmlSubprocessIpc";
import { getScriptCommand } from "./subprocessScript";
import type { RunProxyConfig } from "../../network";
import { getBookmarkDomain } from "../../network";
import { truncateUrl } from "./crawlerUtils";
import {
  parseSubprocessErrorSchema,
  parseSubprocessOutputSchema,
} from "./parseHtmlSubprocessIpc";

const tracer = getTracer("@karakeep/workers");

export async function runParseSubprocess(
  htmlContent: string,
  url: string,
  jobId: string,
  abortSignal: AbortSignal,
  runProxy: RunProxyConfig,
  opts?: { metadataOnly?: boolean },
): Promise<{
  metadata: ParseSubprocessOutput["metadata"];
  readableContent: { content: string } | null;
  readerViewAssessment: ParseSubprocessOutput["readerViewAssessment"];
}> {
  return await withSpan(
    tracer,
    "crawlerWorker.runParseSubprocess",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
      },
    },
    async () => {
      logger.info(
        `[Crawler][${jobId}] Spawning parse subprocess for "${truncateUrl(url)}" ...`,
      );

      const { cmd, args } = getScriptCommand(
        "parseHtmlSubprocess",
        serverConfig.crawler.parserMemLimitMb,
      );
      const timeoutMs = serverConfig.crawler.parseTimeoutSec * 1000;

      // Hand the HTML to the subprocess via a temp file instead of stdin. The
      // file is only needed while the subprocess runs, so it's removed as soon
      // as it exits (including on abort/timeout).
      const tmpDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "karakeep-parse-"),
      );
      const htmlPath = path.join(tmpDir, "page.html");
      const result = await (async () => {
        try {
          await fs.writeFile(htmlPath, htmlContent, "utf8");
          return await execa({
            input: JSON.stringify({
              htmlPath,
              url,
              jobId,
              metadataOnly: opts?.metadataOnly,
            }),
            cancelSignal: abortSignal,
            timeout: timeoutMs,
            reject: false,
            stderr: "inherit",
            // The metadata extraction fetches some URLs itself (e.g. Reddit's
            // JSON API): send those through the crawl's proxy too.
            env: {
              CRAWLER_HTTP_PROXY: runProxy.httpProxy,
              CRAWLER_HTTPS_PROXY: runProxy.httpsProxy,
              CRAWLER_NO_PROXY: runProxy.noProxy?.join(","),
            },
          })(cmd, args);
        } finally {
          await tryCatch(fs.rm(tmpDir, { recursive: true, force: true }));
        }
      })();

      if (result.isCanceled) {
        throw new Error(
          `[Crawler][${jobId}] Parse subprocess was cancelled (job aborted)`,
        );
      }

      if (result.exitCode !== 0) {
        // Check for OOM: SIGKILL (137) from OS killer, SIGABRT from V8,
        // or V8's "heap out of memory" fatal error message in stderr
        const isOom =
          result.exitCode === 137 ||
          result.signal === "SIGKILL" ||
          result.signal === "SIGABRT";
        const reason = isOom
          ? `OOM killed (exit code ${result.exitCode}). Consider increasing CRAWLER_PARSER_MEM_LIMIT_MB (currently ${serverConfig.crawler.parserMemLimitMb}MB).`
          : `exited with code ${result.exitCode}${result.signal ? ` (signal: ${result.signal})` : ""}`;

        // Try to parse structured error from stdout
        if (result.stdout) {
          let errorOutput: ParseSubprocessError | null = null;
          try {
            errorOutput = parseSubprocessErrorSchema.parse(
              JSON.parse(result.stdout),
            );
          } catch {
            // stdout wasn't valid JSON error, fall through
          }

          if (errorOutput?.error) {
            throw new Error(
              `[Crawler][${jobId}] Parse subprocess ${reason}: ${errorOutput.error}`,
            );
          }
        }

        throw new Error(`[Crawler][${jobId}] Parse subprocess ${reason}`);
      }

      if (!result.stdout) {
        throw new Error(
          `[Crawler][${jobId}] Parse subprocess produced no output`,
        );
      }

      const output = parseSubprocessOutputSchema.parse(
        JSON.parse(result.stdout),
      );
      logger.info(
        `[Crawler][${jobId}] Parse subprocess completed successfully.`,
      );

      return {
        metadata: output.metadata,
        readableContent: output.readableContent,
        readerViewAssessment: output.readerViewAssessment,
      };
    },
  );
}
