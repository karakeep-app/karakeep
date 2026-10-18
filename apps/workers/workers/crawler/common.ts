// What the crawler worker shares with the two Crawler implementations: the
// local one (localCrawler.ts) and the client of a remote crawler
// (remoteCrawler.ts). A Crawler does everything that talks to the crawled
// website (probing, fetching the page, parsing it, downloading assets and
// archiving), and nothing that touches the database or the asset store.

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

export interface FetchPageOptions {
  forceStorePdf: boolean;
  /**
   * Use this precrawled archive instead of fetching the URL. It's only
   * screenshotted (offline) and parsed.
   */
  precrawledHtml?: string;
  /**
   * Skip parsing when the page comes back with a retryable status code, as
   * the caller is going to retry the crawl anyway.
   */
  skipParseOnRetryableStatus: boolean;
}

export interface FetchedPage extends CrawlPageResult {
  /** Null when the parse was skipped (see skipParseOnRetryableStatus). */
  parsed: ParseSubprocessOutput | null;
}

export interface Crawler {
  /** Prepares the crawler (e.g. connects to the browser). */
  init(): Promise<void>;
  getContentTypeAndMetadata(
    ctx: CrawlContext,
    opts?: { skipMetadataExtraction?: boolean },
  ): Promise<UrlProbeResult>;
  /** Fetches the page (or loads the precrawled archive) and parses it. */
  fetchPage(ctx: CrawlContext, opts: FetchPageOptions): Promise<FetchedPage>;
  /** Starts downloading a file. Throws on a non-2xx response. */
  fetchAsset(
    ctx: CrawlContext,
    url: string,
    fileType: string,
  ): Promise<{ contentType: string; body: NodeJS.ReadableStream }>;
  /**
   * Archives the page with monolith into assetPath. Like execa with
   * `reject: false`, failures are reported through the result rather than
   * thrown, so the caller can clean up assetPath.
   */
  archivePage(
    ctx: CrawlContext,
    html: string,
    url: string,
    assetPath: string,
  ): Promise<{ failed: boolean; shortMessage?: string }>;
}
