// The client of a remote crawler (see remoteCrawlerServer.ts): a Crawler that
// has the remote crawler do the work and streams back the results. Used by
// the crawler worker when CRAWLER_REMOTE_URL is set.

import { createWriteStream } from "fs";
import { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { pipeline } from "stream/promises";
import type { MultipartPart } from "@remix-run/multipart-parser";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import type {
  CrawlContext,
  CrawlPageResult,
  Crawler,
  FetchedPage,
} from "./common";
import {
  encodeRequest,
  readJsonPart,
  readParts,
  REMOTE_CRAWLER_BASE_PATH,
  unexpectedPart,
} from "./protocol";

/** POSTs the request to the remote crawler. Throws on an error status. */
async function request(
  path: "probe" | "page" | "asset" | "archive",
  ctx: CrawlContext,
  params: Record<string, unknown>,
  {
    html,
    signal = ctx.abortSignal,
  }: { html?: string; signal?: AbortSignal } = {},
): Promise<Response> {
  const { url, token } = serverConfig.crawler.remote;
  const { jobId, bookmarkId, userId, runProxy, browserCrawlingEnabled } = ctx;
  const { contentType, body } = encodeRequest(
    {
      ctx: {
        jobId,
        bookmarkId,
        userId,
        url: ctx.url,
        runProxy,
        browserCrawlingEnabled,
      },
      ...params,
    },
    html,
  );
  const response = await fetch(
    `${url?.replace(/\/+$/, "")}${REMOTE_CRAWLER_BASE_PATH}/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: `Bearer ${token}`,
      },
      body,
      signal,
    },
  );
  if (!response.ok || !response.body) {
    throw new Error(
      `The remote crawler responded with status ${response.status}: ${await response.text()}`,
    );
  }
  return response;
}

/** The response body as a node stream. */
function bodyStream(response: Response): Readable {
  return Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
}

/** Returns the next part, throwing if there's none. */
async function nextPart(
  parts: AsyncGenerator<MultipartPart>,
): Promise<MultipartPart> {
  const { value, done } = await parts.next();
  if (done) {
    throw new Error("The remote crawler's response ended unexpectedly");
  }
  return value;
}

export const remoteCrawler: Crawler = {
  init: async () => {
    logger.info(
      `[Crawler] Using the remote crawler at ${serverConfig.crawler.remote.url}`,
    );
  },

  getContentTypeAndMetadata: async (ctx, opts) => {
    const { log } = ctx;
    // Lets the metadata reader drop the connection once it's done with it.
    const requestAbort = new AbortController();
    try {
      const parts = readParts(
        await request(
          "probe",
          ctx,
          { skipMetadataExtraction: opts?.skipMetadataExtraction },
          { signal: AbortSignal.any([ctx.abortSignal, requestAbort.signal]) },
        ),
      );
      const { contentType } = readJsonPart(
        await nextPart(parts),
        "contentType",
      );
      log.info(
        `Content-type for the url as determined by the remote crawler is "${contentType}"`,
      );
      // Like the local probe, the metadata promise never rejects.
      const metadata = (async () => {
        try {
          return readJsonPart(await nextPart(parts), "metadata");
        } catch (e) {
          log.warn(
            `Failed to get the page metadata from the remote crawler: ${e}`,
          );
          return null;
        } finally {
          requestAbort.abort();
        }
      })();
      return { contentType, metadata };
    } catch (e) {
      requestAbort.abort();
      log.error(
        `Failed to determine the content-type using the remote crawler: ${e}`,
      );
      return { contentType: null, metadata: Promise.resolve(null) };
    }
  },

  fetchPage: async (ctx, opts) => {
    const { precrawledHtml, ...params } = opts;
    let page: CrawlPageResult | undefined;
    let parsed: FetchedPage["parsed"] | undefined;
    for await (const part of readParts(
      await request("page", ctx, params, { html: precrawledHtml }),
    )) {
      if (part.name === "page") {
        page = {
          htmlContent: precrawledHtml ?? "",
          screenshot: undefined,
          pdf: undefined,
          ...readJsonPart(part, "page"),
        };
      } else if (!page) {
        throw unexpectedPart(part);
      } else if (part.name === "html") {
        page.htmlContent = Buffer.from(part.bytes).toString("utf8");
      } else if (part.name === "screenshot" || part.name === "pdf") {
        page[part.name] = Buffer.from(part.bytes);
      } else {
        parsed = readJsonPart(part, "parsed");
      }
    }
    if (!page || parsed === undefined) {
      throw new Error("The remote crawler's response was incomplete");
    }
    return { ...page, parsed };
  },

  fetchAsset: async (ctx, url, fileType) => {
    const response = await request("asset", ctx, { url, fileType });
    return {
      contentType: response.headers.get("content-type") ?? "",
      body: bodyStream(response),
    };
  },

  archivePage: async (ctx, html, url, assetPath) => {
    try {
      const response = await request("archive", ctx, { url }, { html });
      await pipeline(bodyStream(response), createWriteStream(assetPath));
      return { failed: false };
    } catch (e) {
      return {
        failed: true,
        shortMessage: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
