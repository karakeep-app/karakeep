// The client of a remote sandbox (see ../sandbox/server.ts): a Crawler that
// has the remote sandbox do the work and streams back the results. Used by
// the crawler worker when SANDBOX_REMOTE_URL is set.

import { createWriteStream } from "fs";
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
import type { SandboxEndpoint } from "../sandbox/client";
import { readJsonPart, readParts, unexpectedPart } from "../sandbox/protocol";
import { bodyStream, postToSandbox } from "../sandbox/client";

/** POSTs the request to the remote sandbox. Throws on an error status. */
async function request(
  endpoint: SandboxEndpoint,
  ctx: CrawlContext,
  params: Record<string, unknown>,
  {
    html,
    signal = ctx.abortSignal,
  }: { html?: string; signal?: AbortSignal } = {},
): Promise<Response> {
  const { jobId, bookmarkId, userId, runProxy, browserCrawlingEnabled } = ctx;
  return postToSandbox(
    endpoint,
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
    { html, signal },
  );
}

/** Returns the next part, throwing if there's none. */
async function nextPart(
  parts: AsyncGenerator<MultipartPart>,
): Promise<MultipartPart> {
  const { value, done } = await parts.next();
  if (done) {
    throw new Error("The remote sandbox's response ended unexpectedly");
  }
  return value;
}

export const remoteCrawler: Crawler = {
  init: async () => {
    logger.info(
      `[Crawler] Using the remote sandbox at ${serverConfig.sandbox.url}`,
    );
  },

  getContentTypeAndMetadata: async (ctx, opts) => {
    const { log } = ctx;
    // Lets the metadata reader drop the connection once it's done with it.
    const requestAbort = new AbortController();
    try {
      const parts = readParts(
        await request(
          "probe-url",
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
        `Content-type for the url as determined by the remote sandbox is "${contentType}"`,
      );
      // Like the local probe, the metadata promise never rejects.
      const metadata = (async () => {
        try {
          return readJsonPart(await nextPart(parts), "metadata");
        } catch (e) {
          log.warn(
            `Failed to get the page metadata from the remote sandbox: ${e}`,
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
        `Failed to determine the content-type using the remote sandbox: ${e}`,
      );
      return { contentType: null, metadata: Promise.resolve(null) };
    }
  },

  fetchPage: async (ctx, opts) => {
    const { precrawledHtml, ...params } = opts;
    let page: CrawlPageResult | undefined;
    let parsed: FetchedPage["parsed"] | undefined;
    for await (const part of readParts(
      await request("fetch-page", ctx, params, { html: precrawledHtml }),
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
      throw new Error("The remote sandbox's response was incomplete");
    }
    return { ...page, parsed };
  },

  fetchAsset: async (ctx, url, fileType) => {
    const response = await request("fetch-asset", ctx, { url, fileType });
    return {
      contentType: response.headers.get("content-type") ?? "",
      body: bodyStream(response),
    };
  },

  archivePage: async (ctx, html, url, assetPath) => {
    try {
      const response = await request("archive-page", ctx, { url }, { html });
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
