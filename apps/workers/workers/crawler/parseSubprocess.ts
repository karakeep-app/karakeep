// Runs the HTML parsing (metadata extraction + readability) in a separate
// node process with a bounded heap, so a pathological page can't OOM the
// worker itself.
import { execa } from "execa";

import { getTracer, withSpan } from "@karakeep/shared-server";
import { getBookmarkDomain } from "network";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import type {
  ParseSubprocessError,
  ParseSubprocessOutput,
} from "../utils/parseHtmlSubprocessIpc";
import {
  parseSubprocessErrorSchema,
  parseSubprocessOutputSchema,
} from "../utils/parseHtmlSubprocessIpc";
import { truncateUrl } from "./utils";

const tracer = getTracer("@karakeep/workers");

function getSubprocessScriptPath(): string {
  const currentUrl = import.meta.url;
  if (currentUrl.includes("/dist/")) {
    // Production: running from built output
    return new URL("./scripts/parseHtmlSubprocess.js", currentUrl).pathname;
  }
  // Dev mode: running via tsx
  return new URL("../../scripts/parseHtmlSubprocess.ts", currentUrl).pathname;
}

function getSubprocessCommand(): { cmd: string; args: string[] } {
  const scriptPath = getSubprocessScriptPath();
  const maxOldSpaceSize = serverConfig.crawler.parserMemLimitMb;

  if (scriptPath.endsWith(".ts")) {
    // Dev mode: use tsx to run TypeScript directly
    return {
      cmd: "tsx",
      args: [`--max-old-space-size=${maxOldSpaceSize}`, scriptPath],
    };
  }

  return {
    cmd: process.execPath,
    args: [`--max-old-space-size=${maxOldSpaceSize}`, scriptPath],
  };
}

export async function runParseSubprocess(
  htmlContent: string,
  url: string,
  jobId: string,
  abortSignal: AbortSignal,
  opts?: { metadataOnly?: boolean },
): Promise<{
  metadata: ParseSubprocessOutput["metadata"];
  readableContent: { content: string } | null;
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

      const { cmd, args } = getSubprocessCommand();
      const timeoutMs = serverConfig.crawler.parseTimeoutSec * 1000;

      const result = await execa({
        input: JSON.stringify({
          htmlContent,
          url,
          jobId,
          metadataOnly: opts?.metadataOnly,
        }),
        cancelSignal: abortSignal,
        timeout: timeoutMs,
        reject: false,
        stderr: "inherit",
      })(cmd, args);

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
      };
    },
  );
}
