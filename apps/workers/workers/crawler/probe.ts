// The pre-crawl probe: a plain GET that determines the URL's content type
// (deciding asset-bookmark vs webpage routing) and, for HTML pages,
// opportunistically extracts preview metadata in the background so the
// bookmark gets a title/thumbnail before the slow browser render finishes.
import { eq, sql } from "drizzle-orm";
import { fetchWithProxy, getBookmarkDomain } from "network";
import type { RunProxyConfig } from "network";
import { raceWith, timeoutRejectRace } from "utils";

import { db } from "@karakeep/db";
import { bookmarkLinks } from "@karakeep/db/schema";
import {
  addLogFields,
  getTracer,
  setSpanAttributes,
  withSpan,
} from "@karakeep/shared-server";
import { ASSET_TYPES } from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { tryCatch } from "@karakeep/shared/tryCatch";

import type { ParseSubprocessOutput } from "../utils/parseHtmlSubprocessIpc";
import { isLikelyChallengePage } from "../utils/metadataResolver";
import { runParseSubprocess } from "./parseSubprocess";
import {
  normalizeContentType,
  shouldRetryCrawlStatusCode,
  truncateUrl,
} from "./utils";

const tracer = getTracer("@karakeep/workers");

// Cap how much of the probed page we buffer for metadata extraction.
// Preview metadata lives in <head>, so a couple of MB is plenty.
const PROBE_MAX_BODY_BYTES = 2 * 1024 * 1024;
// The content-type routing decision needs only the response headers, so it
// keeps the tight timeout the probe always had. The body download (for
// metadata extraction) runs alongside the browser crawl, so it gets a more
// generous overall budget.
const PROBE_HEADERS_TIMEOUT_MS = 5_000;
const PROBE_TIMEOUT_MS = 30_000;

const PROBE_HTML_CONTENT_TYPES = new Set<string>([
  ASSET_TYPES.TEXT_HTML,
  "application/xhtml+xml",
]);

export interface UrlProbeResult {
  contentType: string | null;
  /**
   * The URL after any redirects the probe followed. Callers use this to
   * resolve link-shortener URLs to their real destination.
   */
  finalUrl: string;
  /**
   * Resolves with the page's preview metadata (or null). The extraction runs
   * in the background so it can overlap with the browser crawl — await it
   * only when the metadata is actually needed. Never rejects.
   */
  metadata: Promise<ParseSubprocessOutput["metadata"] | null>;
}

/**
 * Probes the URL with a plain GET to determine its content type. When the
 * response is an HTML page, the body is also parsed (via the parse subprocess
 * in metadata-only mode) so callers get the page's preview metadata without
 * waiting for the full browser render. The returned promise resolves once the
 * content type is known; the metadata extraction keeps running in the
 * background behind `metadata`. Extraction is best-effort and never affects
 * the returned content type.
 */
export async function getContentTypeAndMetadata(
  url: string,
  jobId: string,
  abortSignal: AbortSignal,
  runProxy: RunProxyConfig,
  opts?: { skipMetadataExtraction?: boolean },
): Promise<UrlProbeResult> {
  return await withSpan(
    tracer,
    "crawlerWorker.getContentTypeAndMetadata",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
      },
    },
    async () => {
      // The request-level signal uses the long budget (it also governs the
      // body read); the wait for the headers is raced separately against the
      // short timeout so a dead host can't delay the routing decision.
      const probeAbort = new AbortController();
      let response;
      try {
        logger.info(
          `[Crawler][${jobId}] Attempting to determine the content-type for the url ${truncateUrl(url)}`,
        );
        response = await raceWith(
          fetchWithProxy(
            url,
            {
              method: "GET",
              signal: AbortSignal.any([
                AbortSignal.timeout(PROBE_TIMEOUT_MS),
                abortSignal,
                probeAbort.signal,
              ]),
              size: PROBE_MAX_BODY_BYTES,
              headers: serverConfig.crawler.preflightUserAgent
                ? { "User-Agent": serverConfig.crawler.preflightUserAgent }
                : undefined,
            },
            runProxy,
          ),
          timeoutRejectRace(
            PROBE_HEADERS_TIMEOUT_MS,
            `Timed out after ${PROBE_HEADERS_TIMEOUT_MS}ms waiting for the response headers`,
          ),
        );
      } catch (e) {
        // Stop the underlying fetch if it's still in flight (header timeout).
        probeAbort.abort();
        logger.error(
          `[Crawler][${jobId}] Failed to determine the content-type for the url ${truncateUrl(url)}: ${e}`,
        );
        return {
          contentType: null,
          finalUrl: url,
          metadata: Promise.resolve(null),
        };
      }
      setSpanAttributes({
        "crawler.getContentType.statusCode": response.status,
      });
      const rawContentType = response.headers.get("content-type");
      const contentType = normalizeContentType(rawContentType);
      setSpanAttributes({
        "crawler.contentType": contentType ?? undefined,
      });
      logger.info(
        `[Crawler][${jobId}] Content-type for the url ${truncateUrl(url)} is "${contentType}"`,
      );

      if (!contentType || !PROBE_HTML_CONTENT_TYPES.has(contentType)) {
        return {
          contentType,
          finalUrl: response.url,
          metadata: Promise.resolve(null),
        };
      }

      // A previous run already extracted and stored this page's metadata; the
      // probe was only needed for the content-type routing decision.
      if (opts?.skipMetadataExtraction) {
        logger.info(
          `[Crawler][${jobId}] Skipping metadata extraction from the content-type probe for the url ${truncateUrl(url)} as it was already fetched by a previous run`,
        );
        addLogFields<"crawlerWorker.run">({
          "crawler.probe.metadata": "reused_stored",
        });
        return {
          contentType,
          finalUrl: response.url,
          metadata: Promise.resolve(null),
        };
      }

      // A blocked/retryable status usually means a challenge or error page
      // whose metadata would be junk — don't extract it.
      if (shouldRetryCrawlStatusCode(response.status)) {
        logger.info(
          `[Crawler][${jobId}] Skipping metadata extraction from the content-type probe for the url ${truncateUrl(url)} due to status code ${response.status}`,
        );
        addLogFields<"crawlerWorker.run">({
          "crawler.probe.metadata": "blocked_status",
        });
        return {
          contentType,
          finalUrl: response.url,
          metadata: Promise.resolve(null),
        };
      }

      // The response is an HTML page: parse its metadata from the body we've
      // already fetched. This is deliberately NOT awaited so it runs alongside
      // the browser crawl. It must never reject (callers may await it late or
      // not at all) and any failure here must not lose the content type, as
      // that would regress the asset-vs-webpage routing decision.
      const metadata = (async () => {
        try {
          const htmlContent = await response.text();
          const { metadata: parsedMetadata } = await runParseSubprocess(
            htmlContent,
            response.url,
            jobId,
            abortSignal,
            { metadataOnly: true },
          );
          if (
            isLikelyChallengePage({ title: parsedMetadata.title, htmlContent })
          ) {
            logger.info(
              `[Crawler][${jobId}] The content-type probe response for the url ${truncateUrl(url)} looks like a bot-challenge page; ignoring its metadata`,
            );
            addLogFields<"crawlerWorker.run">({
              "crawler.probe.metadata": "challenge_page",
            });
            return null;
          }
          logger.info(
            `[Crawler][${jobId}] Extracted page metadata from the content-type probe for the url ${truncateUrl(url)}`,
          );
          addLogFields<"crawlerWorker.run">({
            "crawler.probe.metadata": "extracted",
          });
          return parsedMetadata;
        } catch (e) {
          logger.warn(
            `[Crawler][${jobId}] Failed to extract page metadata from the content-type probe for the url ${truncateUrl(url)}: ${e}`,
          );
          addLogFields<"crawlerWorker.run">({
            "crawler.probe.metadata": "failed",
          });
          return null;
        }
      })();
      return { contentType, finalUrl: response.url, metadata };
    },
  );
}

/**
 * Writes the preview metadata extracted by the pre-crawl probe so the bookmark
 * gets a title/thumbnail before the (slow) browser render finishes.
 *
 * The write is strictly fill-only: each field is wrapped in
 * COALESCE(NULLIF(existing, ''), new) so it can only populate fields that are
 * currently empty and never override an existing value. This matters because
 * the probe extraction runs detached from the crawl attempt's lifecycle — if
 * an attempt fails early, this write can fire after a *retry* (possibly on
 * another worker) has already stored its final metadata, and it must not
 * clobber it. The post-render metadata write refines these values within the
 * owning attempt.
 */
export async function writeProbeMetadata(
  bookmarkId: string,
  metadata: ParseSubprocessOutput["metadata"],
  jobId: string,
) {
  // Don't store data URIs as they're not valid URLs and are usually quite large
  const image =
    metadata.image && !metadata.image.startsWith("data:")
      ? metadata.image
      : null;
  if (!metadata.title && !metadata.description && !image && !metadata.logo) {
    return;
  }
  await db
    .update(bookmarkLinks)
    .set({
      ...(metadata.title
        ? {
            title: sql`COALESCE(NULLIF(${bookmarkLinks.title}, ''), ${metadata.title})`,
          }
        : {}),
      ...(metadata.description
        ? {
            description: sql`COALESCE(NULLIF(${bookmarkLinks.description}, ''), ${metadata.description})`,
          }
        : {}),
      ...(image
        ? {
            imageUrl: sql`COALESCE(NULLIF(${bookmarkLinks.imageUrl}, ''), ${image})`,
          }
        : {}),
      ...(metadata.logo
        ? {
            favicon: sql`COALESCE(NULLIF(${bookmarkLinks.favicon}, ''), ${metadata.logo})`,
          }
        : {}),
      // Also record that the probe metadata has been fetched and stored, so
      // crawl retries can skip re-fetching it (see loadStoredProbeMetadata).
      probeMetadataAt: new Date(),
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
  logger.info(
    `[Crawler][${jobId}] Wrote early metadata from the content-type probe.`,
  );
}

/**
 * Reloads previously stored probe metadata from the bookmark row. Used on
 * crawl retries (where `probeMetadataAt` shows a probe already succeeded)
 * instead of re-fetching and re-parsing the page, so the blocked-render merge
 * protection keeps working without the extra fetch. Never rejects.
 */
export async function loadStoredProbeMetadata(
  bookmarkId: string,
  jobId: string,
): Promise<ParseSubprocessOutput["metadata"] | null> {
  const { data: row, error } = await tryCatch(
    db.query.bookmarkLinks.findFirst({
      where: eq(bookmarkLinks.id, bookmarkId),
      columns: {
        title: true,
        description: true,
        imageUrl: true,
        favicon: true,
        author: true,
        publisher: true,
        datePublished: true,
        dateModified: true,
      },
    }),
  );
  if (error || !row) {
    if (error) {
      logger.warn(
        `[Crawler][${jobId}] Failed to load stored probe metadata: ${error}`,
      );
    }
    return null;
  }
  return {
    title: row.title,
    description: row.description,
    image: row.imageUrl,
    logo: row.favicon,
    author: row.author,
    publisher: row.publisher,
    datePublished: row.datePublished?.toISOString() ?? null,
    dateModified: row.dateModified?.toISOString() ?? null,
  };
}
