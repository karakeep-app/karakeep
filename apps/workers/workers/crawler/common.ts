// What the crawler worker shares with the local crawler (localCrawler.ts):
// the tracing helpers, the crawl context and the types they exchange.

import type { RunProxyConfig } from "../../network";

import { getTracer, withSpan } from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";

import type { ParseSubprocessOutput } from "../utils/parseHtmlSubprocessIpc";

const tracer = getTracer("@karakeep/workers");

// Runs fn in a "crawlerWorker.<name>" span, a child of the current span.
// Job-level attributes (job, bookmark, user) live on the root
// crawlerWorker.run span; child spans only add their own specifics.
export function span<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return withSpan(tracer, `crawlerWorker.${name}`, {}, fn);
}

// Wraps fn so that every call runs in its own span (see span()).
export function traced<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args) => span(name, () => fn(...args));
}

/**
 * What every step of a crawl needs to know about the job. Built once in
 * runCrawler and passed as the first argument to each step.
 */
export interface CrawlContext {
  jobId: string;
  bookmarkId: string;
  userId: string;
  /** The bookmark's URL, before any redirects. */
  url: string;
  abortSignal: AbortSignal;
  /** Picked once per run so that every request in the run uses the same proxy. */
  runProxy: RunProxyConfig;
  /**
   * False when the user has browser crawling disabled, in which case pages
   * are fetched over plain HTTP instead of with the browser.
   */
  browserCrawlingEnabled: boolean;
  log: CrawlLogger;
}

type CrawlLogger = Record<"info" | "warn" | "error", (message: string) => void>;

/** Logs with the "[Crawler][<jobId>]" prefix that all crawler log lines use. */
export function crawlLogger(jobId: string): CrawlLogger {
  const prefix = `[Crawler][${jobId}]`;
  return {
    info: (message) => logger.info(`${prefix} ${message}`),
    warn: (message) => logger.warn(`${prefix} ${message}`),
    error: (message) => logger.error(`${prefix} ${message}`),
  };
}

export interface UrlProbeResult {
  contentType: string | null;
  /**
   * Resolves with the page's preview metadata (or null). The extraction runs
   * in the background so it can overlap with the browser crawl — await it
   * only when the metadata is actually needed. Never rejects.
   */
  metadata: Promise<ParseSubprocessOutput["metadata"] | null>;
}

export interface CrawlPageResult {
  htmlContent: string;
  screenshot: Buffer | undefined;
  pdf: Buffer | undefined;
  statusCode: number;
  url: string;
}

export const CAPTURED_ASSETS = {
  screenshot: {
    captureSpanName: "crawlPage.captureScreenshot",
    storeSpanName: "storeScreenshot",
    label: "screenshot",
    // Must match the format capturePageAssets takes the screenshot in.
    contentType: "image/jpeg",
    fileName: "screenshot.jpeg",
  },
  pdf: {
    captureSpanName: "crawlPage.capturePdf",
    storeSpanName: "storePdf",
    label: "PDF",
    contentType: "application/pdf",
    fileName: "page.pdf",
  },
} as const;
