// The HTTP API of a remote crawler: a worker started with
// CRAWLER_REMOTE_SERVER_ENABLED=true runs no queues and never touches the
// database or the asset store. It only serves these routes, running the local
// crawler on behalf of crawler workers configured with CRAWLER_REMOTE_URL.
// See protocol.ts for the wire format.

import type { HttpBindings } from "@hono/node-server";
import type { Context } from "hono";
import { createReadStream, promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { Semaphore } from "async-mutex";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { stream } from "hono/streaming";
import type { z } from "zod";

import { newAssetId } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { tryCatch } from "@karakeep/shared/tryCatch";

import type { CrawlContext } from "./common";
import type { Part, SerializedCrawlContext } from "./protocol";
import { CAPTURED_ASSETS, crawlLogger } from "./common";
import { loadPage, localCrawler, parsePage } from "./localCrawler";
import {
  decodeRequest,
  jsonPart,
  MultipartWriter,
  zArchivePageRequestSchema,
  zFetchAssetRequestSchema,
  zFetchPageRequestSchema,
  zProbeRequestSchema,
} from "./protocol";

interface Env {
  Bindings: HttpBindings;
}

/**
 * Validates the request and builds its CrawlContext. The crawl is aborted
 * when the client disconnects or after CRAWLER_JOB_TIMEOUT_SEC.
 */
async function parseRequest<T extends { ctx: SerializedCrawlContext }>(
  c: Context<Env>,
  schema: z.ZodType<T>,
): Promise<{ request: T; ctx: CrawlContext } | null> {
  const request = await decodeRequest(c.req.raw, schema);
  if (!request) {
    return null;
  }
  const ctx: CrawlContext = {
    ...request.ctx,
    abortSignal: AbortSignal.any([
      c.req.raw.signal,
      AbortSignal.timeout(serverConfig.crawler.jobTimeoutSec * 1000),
    ]),
    log: crawlLogger(request.ctx.jobId),
  };
  return { request, ctx };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Streams a multipart response: the parts that fn writes as they're ready,
 * then the last part that it returns (or an error part if it throws).
 */
async function multipart<T extends { ctx: SerializedCrawlContext }>(
  c: Context<Env>,
  schema: z.ZodType<T>,
  fn: (
    request: T,
    ctx: CrawlContext,
    write: (part: Part) => Promise<unknown>,
  ) => Promise<Part>,
) {
  const parsed = await parseRequest(c, schema);
  if (!parsed) {
    return c.json({ error: "Malformed request" }, 400);
  }
  const { request, ctx } = parsed;
  const writer = new MultipartWriter();
  c.header("Content-Type", writer.contentType);
  return stream(c, async (s) => {
    await s.write(writer.start());
    let last: Part;
    try {
      last = await fn(request, ctx, (part) => s.write(writer.part(part)));
    } catch (e) {
      ctx.log.error(`Remote crawler request failed: ${e}`);
      last = jsonPart("error", { message: errorMessage(e) });
    }
    await s.write(writer.part(last, { last: true }));
  });
}

/**
 * Responds with the file that fn returns, or with an error status if fn
 * throws.
 */
async function file<T extends { ctx: SerializedCrawlContext }>(
  c: Context<Env>,
  schema: z.ZodType<T>,
  fn: (
    request: T,
    ctx: CrawlContext,
  ) => Promise<{
    contentType: string;
    body: AsyncIterable<Uint8Array | string>;
  }>,
) {
  const parsed = await parseRequest(c, schema);
  if (!parsed) {
    return c.json({ error: "Malformed request" }, 400);
  }
  const { request, ctx } = parsed;
  let result;
  try {
    result = await fn(request, ctx);
  } catch (e) {
    ctx.log.error(`Remote crawler request failed: ${e}`);
    return c.json({ error: errorMessage(e) }, 502);
  }
  const chunks = result.body[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(
            typeof value === "string" ? Buffer.from(value, "utf8") : value,
          );
        }
      } catch (e) {
        ctx.log.error(`Remote crawler request failed: ${e}`);
        // Erroring the stream would still end the response normally, making
        // the truncated file look complete. Drop the connection instead.
        c.env.outgoing.destroy();
      }
    },
    async cancel() {
      await chunks.return?.();
    },
  });
  return c.body(body, 200, { "Content-Type": result.contentType });
}

export function buildRemoteCrawlerRoutes(token: string) {
  // Fetching a page is the expensive part (a browser context each), so cap
  // it like the crawler worker caps its own concurrency.
  const pageSemaphore = new Semaphore(serverConfig.crawler.numWorkers);

  return new Hono<Env>()
    .use(bearerAuth({ token }))
    .post("/probe", (c) =>
      multipart(c, zProbeRequestSchema, async (request, ctx, write) => {
        const { contentType, metadata } =
          await localCrawler.getContentTypeAndMetadata(ctx, request);
        await write(jsonPart("contentType", { contentType }));
        return jsonPart("metadata", await metadata);
      }),
    )
    .post("/page", (c) =>
      multipart(c, zFetchPageRequestSchema, async (request, ctx, write) => {
        const opts = { ...request, precrawledHtml: request.html };
        // Only the browser work holds a slot, so a slow reader can't.
        const page = await pageSemaphore.runExclusive(() => {
          ctx.abortSignal.throwIfAborted();
          return loadPage(ctx, opts);
        });
        // Send the page before parsing it, so it's on its way meanwhile.
        await write(
          jsonPart("page", { statusCode: page.statusCode, url: page.url }),
        );
        if (opts.precrawledHtml === undefined) {
          await write({
            name: "html",
            contentType: "text/html; charset=utf-8",
            data: page.htmlContent,
          });
        }
        if (page.screenshot) {
          await write({
            name: "screenshot",
            contentType: CAPTURED_ASSETS.screenshot.contentType,
            data: page.screenshot,
          });
        }
        if (page.pdf) {
          await write({
            name: "pdf",
            contentType: CAPTURED_ASSETS.pdf.contentType,
            data: page.pdf,
          });
        }
        return jsonPart("parsed", await parsePage(ctx, page, opts));
      }),
    )
    .post("/asset", (c) =>
      file(c, zFetchAssetRequestSchema, (request, ctx) =>
        localCrawler.fetchAsset(ctx, request.url, request.fileType),
      ),
    )
    .post("/archive", (c) =>
      file(c, zArchivePageRequestSchema, async (request, ctx) => {
        const assetPath = path.join(os.tmpdir(), newAssetId());
        const res = await localCrawler.archivePage(
          ctx,
          request.html,
          request.url,
          assetPath,
        );
        if (res.failed) {
          await tryCatch(fs.unlink(assetPath));
          throw new Error(res.shortMessage);
        }
        const body = createReadStream(assetPath);
        body.once("close", () => void tryCatch(fs.unlink(assetPath)));
        return { contentType: "text/html", body };
      }),
    );
}
