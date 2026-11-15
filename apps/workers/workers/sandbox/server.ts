// The HTTP API of a remote sandbox: a worker started with
// SANDBOX_REMOTE_SERVER_ENABLED=true runs no queues and never touches the
// database or the asset store. It only serves these routes, doing the
// untrusted work (crawling, downloading videos and parsing assets) on behalf
// of workers configured with SANDBOX_REMOTE_URL. See protocol.ts for the wire
// format.

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

import { ASSET_TYPES, newAssetId } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { tryCatch } from "@karakeep/shared/tryCatch";

import type { AssetJob } from "../assetPreprocessing/common";
import type { CrawlContext } from "../crawler/common";
import type { Part, SerializedCrawlContext } from "./protocol";
import { localAssetProcessor } from "../assetPreprocessing/localAssetProcessor";
import { localVideoDownloader } from "../video/localVideoDownloader";
import { CAPTURED_ASSETS, crawlLogger } from "../crawler/common";
import { loadPage, localCrawler, parsePage } from "../crawler/localCrawler";
import {
  decodeRequest,
  jsonPart,
  MultipartWriter,
  SKIP_REASON_HEADER,
  WORK_FAILED_STATUS,
  zArchivePageRequestSchema,
  zDownloadVideoRequestSchema,
  zFetchAssetRequestSchema,
  zFetchPageRequestSchema,
  zProbeRequestSchema,
  zProcessAssetRequestSchema,
} from "./protocol";

interface Env {
  Bindings: HttpBindings;
}

/**
 * Aborted when the client disconnects or after timeoutSec, the timeout of the
 * worker's job.
 */
function requestSignal(c: Context<Env>, timeoutSec: number): AbortSignal {
  return AbortSignal.any([
    c.req.raw.signal,
    AbortSignal.timeout(timeoutSec * 1000),
  ]);
}

function malformedRequest(c: Context<Env>) {
  return c.json({ error: "Malformed request" }, 400);
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
    abortSignal: requestSignal(c, serverConfig.crawler.jobTimeoutSec),
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
    return malformedRequest(c);
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
      ctx.log.error(`Sandbox request failed: ${e}`);
      last = jsonPart("error", { message: errorMessage(e) });
    }
    await s.write(writer.part(last, { last: true }));
  });
}

interface FileResult {
  contentType: string;
  body: AsyncIterable<Uint8Array | string>;
}

/**
 * Responds with the file that fn returns, or with an error status if fn
 * throws.
 */
async function file<T extends { ctx: SerializedCrawlContext }>(
  c: Context<Env>,
  schema: z.ZodType<T>,
  fn: (request: T, ctx: CrawlContext) => Promise<FileResult>,
) {
  const parsed = await parseRequest(c, schema);
  if (!parsed) {
    return malformedRequest(c);
  }
  const { request, ctx } = parsed;
  let result;
  try {
    result = await fn(request, ctx);
  } catch (e) {
    ctx.log.error(`Sandbox request failed: ${e}`);
    return c.json({ error: errorMessage(e) }, WORK_FAILED_STATUS);
  }
  return sendFile(c, ctx.log.error, result);
}

/**
 * Streams the file. A failure partway through drops the connection (and is
 * logged with logError).
 */
function sendFile(
  c: Context<Env>,
  logError: (message: string) => void,
  result: FileResult,
) {
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
        logError(`Sandbox request failed: ${e}`);
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

/** The temporary file at filePath, which is deleted once it's been read. */
function tempFile(filePath: string, contentType: string): FileResult {
  const body = createReadStream(filePath);
  body.once("close", () => void tryCatch(fs.unlink(filePath)));
  return { contentType, body };
}

/**
 * Runs fn on the asset of a /pdf-text, /pdf-screenshot or /image-text
 * request. Responds with an error status if fn throws.
 */
async function processAsset(
  c: Context<Env>,
  fn: (job: AssetJob, asset: Buffer) => Promise<Response>,
) {
  const request = await decodeRequest(c.req.raw, zProcessAssetRequestSchema);
  if (!request) {
    return malformedRequest(c);
  }
  const job: AssetJob = {
    jobId: request.jobId,
    abortSignal: requestSignal(
      c,
      serverConfig.assetPreprocessing.jobTimeoutSec,
    ),
  };
  const { buffer, byteOffset, byteLength } = request.file;
  try {
    return await fn(job, Buffer.from(buffer, byteOffset, byteLength));
  } catch (e) {
    logger.error(
      `[assetPreprocessing][${job.jobId}] Sandbox request failed: ${e}`,
    );
    return c.json({ error: errorMessage(e) }, WORK_FAILED_STATUS);
  }
}

export function buildSandboxRoutes(token: string) {
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
        return tempFile(assetPath, "text/html");
      }),
    )
    .post("/video", async (c) => {
      const request = await decodeRequest(
        c.req.raw,
        zDownloadVideoRequestSchema,
      );
      if (!request) {
        return malformedRequest(c);
      }
      const logError = (message: string) =>
        logger.error(`[VideoCrawler][${request.jobId}] ${message}`);
      const assetId = newAssetId();
      let result;
      try {
        result = await localVideoDownloader.download({
          ...request,
          assetId,
          abortSignal: requestSignal(
            c,
            serverConfig.crawler.downloadVideoTimeout,
          ),
        });
      } catch (e) {
        // Not yt-dlp failing (that's a "failed" result), so the worker should
        // retry, as it would after the same error locally.
        logError(`Sandbox request failed: ${e}`);
        return c.json({ error: errorMessage(e) }, 500);
      }
      switch (result.status) {
        case "skipped":
          return c.body(null, 204, {
            [SKIP_REASON_HEADER]: encodeURIComponent(result.reason),
          });
        case "failed":
          logError(`Failed to download the video: ${result.reason}`);
          return c.json({ error: result.reason }, WORK_FAILED_STATUS);
        case "downloaded":
          return sendFile(
            c,
            logError,
            tempFile(result.path, ASSET_TYPES.VIDEO_MP4),
          );
      }
    })
    .post("/pdf-text", (c) =>
      processAsset(c, async (job, pdf) =>
        c.json(await localAssetProcessor.readPdfText(job, pdf)),
      ),
    )
    .post("/pdf-screenshot", (c) =>
      processAsset(c, async (job, pdf) =>
        c.body(
          new Uint8Array(
            await localAssetProcessor.renderPdfScreenshot(job, pdf),
          ),
          200,
          { "Content-Type": "image/png" },
        ),
      ),
    )
    .post("/image-text", (c) =>
      processAsset(c, async (job, image) =>
        c.json({
          text: await localAssetProcessor.readImageText(job, image),
        }),
      ),
    );
}
