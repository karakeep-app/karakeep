import * as dns from "dns";
import { promises as fs } from "fs";
import * as fsSync from "fs";
import * as path from "node:path";
import * as os from "os";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { PlaywrightBlocker } from "@ghostery/adblocker-playwright";
import { Mutex } from "async-mutex";
import { and, eq } from "drizzle-orm";
import { execa } from "execa";
import { exitAbortController } from "exit";
import {
  bookmarkCrawlLatencyHistogram,
  crawlerStatusCodeCounter,
  workerStatsCounter,
} from "metrics";
import {
  fetchWithProxy,
  getBookmarkDomain,
  getRandomProxy,
  matchesNoProxy,
  validateUrl,
} from "network";
import {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { withWorkerTracing } from "workerTracing";
import { getBookmarkDetails, updateAsset } from "workerUtils";
import { z } from "zod";

import type { ZCrawlLinkRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  users,
} from "@karakeep/db/schema";
import {
  AssetPreprocessingQueue,
  getTracer,
  OpenAIQueue,
  QuotaService,
  setSpanAttributes,
  triggerSearchReindex,
  triggerWebhook,
  VideoWorkerQueue,
  withSpan,
  zCrawlLinkRequestSchema,
} from "@karakeep/shared-server";
import {
  ASSET_TYPES,
  getAssetSize,
  IMAGE_ASSET_TYPES,
  newAssetId,
  readAsset,
  saveAsset,
  saveAssetFromFile,
  silentDeleteAsset,
  SUPPORTED_UPLOAD_ASSET_TYPES,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import {
  DequeuedJob,
  DequeuedJobError,
  EnqueueOptions,
  getQueueClient,
  Queue,
  QueueRetryAfterError,
} from "@karakeep/shared/queueing";
import { getRateLimitClient } from "@karakeep/shared/ratelimiting";
import { tryCatch } from "@karakeep/shared/tryCatch";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type {
  ParseSubprocessError,
  ParseSubprocessOutput,
} from "./utils/parseHtmlSubprocessIpc";
import {
  parseSubprocessErrorSchema,
  parseSubprocessOutputSchema,
} from "./utils/parseHtmlSubprocessIpc";

const tracer = getTracer("@karakeep/workers");

function abortPromise(signal: AbortSignal): Promise<never> {
  if (signal.aborted) {
    const p = Promise.reject(signal.reason ?? new Error("AbortError"));
    p.catch(() => {
      /* empty */
    }); // suppress unhandledRejection if not awaited
    return p;
  }

  const p = new Promise<never>((_, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(signal.reason ?? new Error("AbortError"));
      },
      { once: true },
    );
  });

  p.catch(() => {
    /* empty */
  });
  return p;
}

/**
 * Normalize a Content-Type header by stripping parameters (e.g., charset)
 * and lowercasing the media type, so comparisons against supported types work.
 */
function normalizeContentType(header: string | null): string | null {
  if (!header) {
    return null;
  }
  return header.split(";", 1)[0]!.trim().toLowerCase();
}

function shouldRetryCrawlStatusCode(statusCode: number | null): boolean {
  if (statusCode === null) {
    return false;
  }
  return statusCode === 403 || statusCode === 429 || statusCode >= 500;
}

interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
});

const cookiesSchema = z.array(cookieSchema);

interface CrawlerRunResult {
  status: "completed";
}

function getPlaywrightProxyConfig(): BrowserContextOptions["proxy"] {
  const { proxy } = serverConfig;

  if (!proxy.httpProxy && !proxy.httpsProxy) {
    return undefined;
  }

  // Use HTTPS proxy if available, otherwise fall back to HTTP proxy
  const proxyList = proxy.httpsProxy || proxy.httpProxy;
  if (!proxyList) {
    // Unreachable, but TypeScript doesn't know that
    return undefined;
  }

  const proxyUrl = getRandomProxy(proxyList);
  const parsed = new URL(proxyUrl);

  return {
    server: proxyUrl,
    username: parsed.username,
    password: parsed.password,
    bypass: proxy.noProxy?.join(","),
  };
}

let globalBrowser: Browser | undefined;
let globalBlocker: PlaywrightBlocker | undefined;
// Global variable to store parsed cookies
let globalCookies: Cookie[] = [];
// Guards the interactions with the browser instance.
// This is needed given that most of the browser APIs are async.
const browserMutex = new Mutex();

// Tracks active browser contexts so we can reap leaked ones.
const activeContexts = new Map<
  string,
  { context: BrowserContext; createdAt: number }
>();

const CONTEXT_CLOSE_TIMEOUT_MS = 10_000;
const PAGE_CLOSE_TIMEOUT_MS = 5_000;

/**
 * Reaps browser contexts that have been open longer than the max job timeout.
 * This is a safety net for cases where context.close() hangs or is never called.
 */
function startContextReaper() {
  const maxContextAgeMs =
    (serverConfig.crawler.jobTimeoutSec + 30) * 1000 +
    60_000 * 5; /* 5 minutes buffer */
  const intervalId = setInterval(() => {
    try {
      const now = Date.now();
      for (const [id, entry] of activeContexts) {
        if (now - entry.createdAt > maxContextAgeMs) {
          logger.warn(
            `[Crawler] Reaping stale browser context for job ${id} (age: ${Math.round((now - entry.createdAt) / 1000)}s)`,
          );
          void Promise.race([
            entry.context
              .close()
              .then(() => true)
              .catch((e: unknown) => {
                logger.warn(
                  `[Crawler] Failed to close stale context for job ${id}: ${e}`,
                );
                return true;
              }),
            new Promise<false>((r) =>
              setTimeout(() => r(false), CONTEXT_CLOSE_TIMEOUT_MS),
            ),
          ]).then((contextClosed) => {
            // Protect against deleting a newer context if the job id gets reused.
            if (!contextClosed) {
              logger.warn(
                `[Crawler] Timed out closing stale context for job ${id} — keeping in active set for retry`,
              );
              return;
            }
            if (activeContexts.get(id) === entry) {
              activeContexts.delete(id);
            }
          });
        }
      }
    } catch (e) {
      logger.error(
        `[Crawler] caught an unexpected error while reaping stale browser contexts: ${e}`,
      );
    }
  }, 60_000 * 5);
  exitAbortController.signal.addEventListener(
    "abort",
    () => clearInterval(intervalId),
    {
      once: true,
    },
  );
}

async function startBrowserInstance() {
  if (serverConfig.crawler.browserWebSocketUrl) {
    logger.info(
      `[Crawler] Connecting to existing browser websocket address: ${serverConfig.crawler.browserWebSocketUrl}`,
    );
    return await chromium.connect(serverConfig.crawler.browserWebSocketUrl, {
      // Important: using slowMo to ensure stability with remote browser
      slowMo: 100,
      timeout: 5000,
    });
  } else if (serverConfig.crawler.browserWebUrl) {
    logger.info(
      `[Crawler] Connecting to existing browser instance: ${serverConfig.crawler.browserWebUrl}`,
    );

    const webUrl = new URL(serverConfig.crawler.browserWebUrl);
    const { address } = await dns.promises.lookup(webUrl.hostname);
    webUrl.hostname = address;
    logger.info(
      `[Crawler] Successfully resolved IP address, new address: ${webUrl.toString()}`,
    );

    return await chromium.connectOverCDP(webUrl.toString(), {
      // Important: using slowMo to ensure stability with remote browser
      slowMo: 100,
      timeout: 5000,
    });
  } else {
    logger.info(`Running in browserless mode`);
    return undefined;
  }
}

async function launchBrowser() {
  globalBrowser = undefined;
  await browserMutex.runExclusive(async () => {
    const globalBrowserResult = await tryCatch(startBrowserInstance());
    if (globalBrowserResult.error) {
      logger.error(
        `[Crawler] Failed to connect to the browser instance, will retry in 5 secs: ${globalBrowserResult.error.stack}`,
      );
      if (exitAbortController.signal.aborted) {
        logger.info("[Crawler] We're shutting down so won't retry.");
        return;
      }
      setTimeout(() => {
        launchBrowser();
      }, 5000);
      return;
    }
    globalBrowser = globalBrowserResult.data;
    globalBrowser?.on("disconnected", () => {
      if (exitAbortController.signal.aborted) {
        logger.info(
          "[Crawler] The Playwright browser got disconnected. But we're shutting down so won't restart it.",
        );
        return;
      }
      logger.info(
        "[Crawler] The Playwright browser got disconnected. Will attempt to launch it again.",
      );
      launchBrowser();
    });
  });
}

export class CrawlerWorker {
  private static initPromise: Promise<void> | null = null;

  private static ensureInitialized() {
    if (!CrawlerWorker.initPromise) {
      CrawlerWorker.initPromise = (async () => {
        chromium.use(StealthPlugin());
        if (serverConfig.crawler.enableAdblocker) {
          logger.info("[crawler] Loading adblocker ...");
          const globalBlockerResult = await tryCatch(
            PlaywrightBlocker.fromPrebuiltFull(fetchWithProxy, {
              path: path.join(os.tmpdir(), "karakeep_adblocker.bin"),
              read: fs.readFile,
              write: fs.writeFile,
            }),
          );
          if (globalBlockerResult.error) {
            logger.error(
              `[crawler] Failed to load adblocker. Will not be blocking ads: ${globalBlockerResult.error}`,
            );
          } else {
            globalBlocker = globalBlockerResult.data;
          }
        }
        if (!serverConfig.crawler.browserConnectOnDemand) {
          await launchBrowser();
        } else {
          logger.info(
            "[Crawler] Browser connect on demand is enabled, won't proactively start the browser instance",
          );
        }
        await loadCookiesFromFile();
        startContextReaper();
      })();
    }
    return CrawlerWorker.initPromise;
  }

  static async build(queue: Queue<ZCrawlLinkRequest>) {
    await CrawlerWorker.ensureInitialized();

    logger.info("Starting crawler worker ...");
    const worker = (await getQueueClient()).createRunner<
      ZCrawlLinkRequest,
      CrawlerRunResult
    >(
      queue,
      {
        run: withWorkerTracing("crawlerWorker.run", (job) =>
          runCrawler(job, queue.opts.defaultJobArgs.numRetries),
        ),
        onComplete: async (job: DequeuedJob<ZCrawlLinkRequest>) => {
          workerStatsCounter.labels("crawler", "completed").inc();
          const jobId = job.id;
          logger.info(`[Crawler][${jobId}] Completed successfully`);
          const bookmarkId = job.data.bookmarkId;
          if (bookmarkId) {
            await db
              .update(bookmarkLinks)
              .set({
                crawlStatus: "success",
              })
              .where(eq(bookmarkLinks.id, bookmarkId));
          }
        },
        onError: async (job: DequeuedJobError<ZCrawlLinkRequest>) => {
          workerStatsCounter.labels("crawler", "failed").inc();
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("crawler", "failed_permanent").inc();
          }
          const jobId = job.id;
          logger.error(
            `[Crawler][${jobId}] Crawling job failed: ${job.error}\n${job.error.stack}`,
          );
          const bookmarkId = job.data?.bookmarkId;
          if (bookmarkId && job.numRetriesLeft == 0) {
            await db.transaction(async (tx) => {
              await tx
                .update(bookmarkLinks)
                .set({
                  crawlStatus: "failure",
                })
                .where(eq(bookmarkLinks.id, bookmarkId));
              await tx
                .update(bookmarks)
                .set({
                  taggingStatus: null,
                })
                .where(
                  and(
                    eq(bookmarks.id, bookmarkId),
                    eq(bookmarks.taggingStatus, "pending"),
                  ),
                );
              await tx
                .update(bookmarks)
                .set({
                  summarizationStatus: null,
                })
                .where(
                  and(
                    eq(bookmarks.id, bookmarkId),
                    eq(bookmarks.summarizationStatus, "pending"),
                  ),
                );
            });
          }
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.crawler.jobTimeoutSec,
        concurrency: serverConfig.crawler.numWorkers,
      },
    );

    return worker;
  }
}

async function loadCookiesFromFile(): Promise<void> {
  try {
    const path = serverConfig.crawler.browserCookiePath;
    if (!path) {
      logger.info(
        "[Crawler] Not defined in the server configuration BROWSER_COOKIE_PATH",
      );
      return;
    }
    const data = await fs.readFile(path, "utf8");
    const cookies = JSON.parse(data);
    globalCookies = cookiesSchema.parse(cookies);
  } catch (error) {
    logger.error("Failed to read or parse cookies file:", error);
    if (error instanceof z.ZodError) {
      logger.error("[Crawler] Invalid cookie file format:", error.errors);
    } else {
      logger.error("[Crawler] Failed to read or parse cookies file:", error);
    }
    throw error;
  }
}

type DBAssetType = typeof assets.$inferInsert;

async function browserlessCrawlPage(
  jobId: string,
  url: string,
  abortSignal: AbortSignal,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.browserlessCrawlPage",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
      },
    },
    async () => {
      logger.info(
        `[Crawler][${jobId}] Running in browserless mode. Will do a plain http request to "${url}". Screenshots will be disabled.`,
      );
      const response = await fetchWithProxy(url, {
        signal: AbortSignal.any([AbortSignal.timeout(5000), abortSignal]),
      });
      logger.info(
        `[Crawler][${jobId}] Successfully fetched the content of "${url}". Status: ${response.status}, Size: ${response.size}`,
      );
      return {
        htmlContent: await response.text(),
        statusCode: response.status,
        screenshot: undefined,
        pdf: undefined,
        url: response.url,
      };
    },
  );
}

async function crawlPage(
  jobId: string,
  url: string,
  userId: string,
  forceStorePdf: boolean,
  abortSignal: AbortSignal,
): Promise<{
  htmlContent: string;
  screenshot: Buffer | undefined;
  pdf: Buffer | undefined;
  statusCode: number;
  url: string;
}> {
  return await withSpan(
    tracer,
    "crawlerWorker.crawlPage",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
        "user.id": userId,
        "crawler.forceStorePdf": forceStorePdf,
      },
    },
    async () => {
      const userData = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { browserCrawlingEnabled: true },
      });
      if (!userData) {
        logger.error(`[Crawler][${jobId}] User ${userId} not found`);
        throw new Error(`User ${userId} not found`);
      }

      const browserCrawlingEnabled = userData.browserCrawlingEnabled;

      if (browserCrawlingEnabled !== null && !browserCrawlingEnabled) {
        return browserlessCrawlPage(jobId, url, abortSignal);
      }

      let browser: Browser | undefined;
      browser = await withSpan(
        tracer,
        "crawlerWorker.crawlPage.getBrowserInstance",
        {
          attributes: {
            "job.id": jobId,
          },
        },
        async () => {
          if (serverConfig.crawler.browserConnectOnDemand) {
            return startBrowserInstance();
          }
          return globalBrowser;
        },
      );
      if (!browser) {
        return browserlessCrawlPage(jobId, url, abortSignal);
      }

      const proxyConfig = getPlaywrightProxyConfig();
      const isRunningInProxyContext =
        proxyConfig !== undefined &&
        !matchesNoProxy(url, proxyConfig.bypass?.split(",") ?? []);
      const context = await withSpan(
        tracer,
        "crawlerWorker.crawlPage.createContext",
        {
          attributes: {
            "job.id": jobId,
          },
        },
        async () =>
          browser.newContext({
            viewport: { width: 1440, height: 900 },
            userAgent:
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            proxy: proxyConfig,
          }),
      );

      activeContexts.set(jobId, { context, createdAt: Date.now() });
      let page: Page | undefined;
      try {
        if (globalCookies.length > 0) {
          await context.addCookies(globalCookies);
          logger.info(
            `[Crawler][${jobId}] Cookies successfully loaded into browser context`,
          );
        }

        page = await withSpan(
          tracer,
          "crawlerWorker.crawlPage.setupPage",
          {
            attributes: {
              "job.id": jobId,
            },
          },
          async () => {
            // Create a new page in the context
            const nextPage = await context.newPage();

            // Apply ad blocking
            if (globalBlocker) {
              await globalBlocker.enableBlockingInPage(nextPage);
            }

            // Auto-dismiss JavaScript dialogs (alert, confirm, prompt)
            // to prevent pages from hanging during crawl.
            nextPage.on("dialog", (dialog) => {
              dialog.dismiss().catch(() => {
                // Ignore errors — the dialog may have already been closed.
              });
            });

            // Block audio/video resources and disallowed sub-requests
            await nextPage.route("**/*", async (route) => {
              if (abortSignal.aborted) {
                await route.abort("aborted");
                return;
              }
              const request = route.request();
              const resourceType = request.resourceType();

              // Block audio/video resources
              if (
                resourceType === "media" ||
                request.headers()["content-type"]?.includes("video/") ||
                request.headers()["content-type"]?.includes("audio/")
              ) {
                await route.abort("aborted");
                return;
              }

              const requestUrl = request.url();
              const requestIsRunningInProxyContext =
                proxyConfig !== undefined &&
                !matchesNoProxy(
                  requestUrl,
                  proxyConfig.bypass?.split(",") ?? [],
                );
              if (
                requestUrl.startsWith("http://") ||
                requestUrl.startsWith("https://")
              ) {
                const validation = await validateUrl(
                  requestUrl,
                  requestIsRunningInProxyContext,
                );
                if (!validation.ok) {
                  logger.warn(
                    `[Crawler][${jobId}] Blocking sub-request to disallowed URL "${requestUrl}": ${validation.reason}`,
                  );
                  await route.abort("blockedbyclient");
                  return;
                }
              }

              // Continue with other requests
              await route.continue();
            });

            // On abort, immediately stop intercepting requests so that
            // in-flight route handlers don't block page/context closure.
            abortSignal.addEventListener(
              "abort",
              () => {
                nextPage.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {
                  // Ignore errors — the page may already be closed.
                });
              },
              { once: true },
            );

            return nextPage;
          },
        );

        // page is guaranteed to be assigned here; alias to a const for
        // TypeScript narrowing so the rest of the try block sees `Page`.
        const activePage = page;

        // Navigate to the target URL
        const navigationValidation = await withSpan(
          tracer,
          "crawlerWorker.crawlPage.validateNavigationTarget",
          {
            attributes: {
              "job.id": jobId,
              "bookmark.url": url,
              "bookmark.domain": getBookmarkDomain(url),
            },
          },
          async () => validateUrl(url, isRunningInProxyContext),
        );
        if (!navigationValidation.ok) {
          throw new Error(
            `Disallowed navigation target "${url}": ${navigationValidation.reason}`,
          );
        }
        const targetUrl = navigationValidation.url.toString();
        logger.info(`[Crawler][${jobId}] Navigating to "${targetUrl}"`);
        const response = await withSpan(
          tracer,
          "crawlerWorker.crawlPage.navigate",
          {
            attributes: {
              "job.id": jobId,
              "bookmark.url": targetUrl,
              "bookmark.domain": getBookmarkDomain(targetUrl),
            },
          },
          async () =>
            Promise.race([
              activePage.goto(targetUrl, {
                timeout: serverConfig.crawler.navigateTimeoutSec * 1000,
                waitUntil: "domcontentloaded",
              }),
              abortPromise(abortSignal).then(() => null),
            ]),
        );
        setSpanAttributes({
          "crawler.statusCode": response?.status() ?? 0,
        });

        logger.info(
          `[Crawler][${jobId}] Successfully navigated to "${targetUrl}". Waiting for the page to load ...`,
        );

        // Wait until network is relatively idle or timeout after 5 seconds
        await withSpan(
          tracer,
          "crawlerWorker.crawlPage.waitForLoadState",
          {
            attributes: {
              "job.id": jobId,
              "bookmark.url": targetUrl,
              "bookmark.domain": getBookmarkDomain(targetUrl),
            },
          },
          async () => {
            await Promise.race([
              activePage
                .waitForLoadState("networkidle", { timeout: 5000 })
                .catch(() => ({})),
              new Promise((resolve) => setTimeout(resolve, 5000)),
              abortPromise(abortSignal),
            ]);
          },
        );

        abortSignal.throwIfAborted();

        logger.info(
          `[Crawler][${jobId}] Finished waiting for the page to load.`,
        );

        const [htmlContent, screenshot, pdf] = await withSpan(
          tracer,
          "crawlerWorker.crawlPage.captureAssets",
          {
            attributes: {
              "job.id": jobId,
            },
          },
          async () => {
            const htmlPromise = withSpan(
              tracer,
              "crawlerWorker.crawlPage.extractHtml",
              {
                attributes: {
                  "job.id": jobId,
                },
              },
              async () => {
                const content = await activePage.content();
                abortSignal.throwIfAborted();
                logger.info(
                  `[Crawler][${jobId}] Successfully fetched the page content.`,
                );
                return content;
              },
            );

            const screenshotPromise: Promise<Buffer | undefined> = serverConfig
              .crawler.storeScreenshot
              ? withSpan(
                  tracer,
                  "crawlerWorker.crawlPage.captureScreenshot",
                  {
                    attributes: {
                      "job.id": jobId,
                      "asset.type": "image",
                    },
                  },
                  async () => {
                    const { data: screenshotData, error: screenshotError } =
                      await tryCatch(
                        Promise.race<Buffer>([
                          activePage.screenshot({
                            // If you change this, you need to change the asset type in the store function.
                            type: "jpeg",
                            fullPage: serverConfig.crawler.fullPageScreenshot,
                            quality: 80,
                          }),
                          new Promise((_, reject) =>
                            setTimeout(
                              () =>
                                reject(
                                  "TIMED_OUT, consider increasing CRAWLER_SCREENSHOT_TIMEOUT_SEC",
                                ),
                              serverConfig.crawler.screenshotTimeoutSec * 1000,
                            ),
                          ),
                          abortPromise(abortSignal).then(() => Buffer.from("")),
                        ]),
                      );
                    abortSignal.throwIfAborted();
                    if (screenshotError) {
                      logger.warn(
                        `[Crawler][${jobId}] Failed to capture the screenshot. Reason: ${screenshotError}`,
                      );
                      return undefined;
                    }
                    setSpanAttributes({
                      "asset.size": screenshotData.byteLength,
                    });
                    logger.info(
                      `[Crawler][${jobId}] Finished capturing page content and a screenshot. FullPageScreenshot: ${serverConfig.crawler.fullPageScreenshot}`,
                    );
                    return screenshotData;
                  },
                )
              : Promise.resolve(undefined);

            const pdfPromise: Promise<Buffer | undefined> =
              serverConfig.crawler.storePdf || forceStorePdf
                ? withSpan(
                    tracer,
                    "crawlerWorker.crawlPage.capturePdf",
                    {
                      attributes: {
                        "job.id": jobId,
                        "asset.type": "pdf",
                      },
                    },
                    async () => {
                      const { data: pdfData, error: pdfError } = await tryCatch(
                        Promise.race<Buffer>([
                          activePage.pdf({
                            format: "A4",
                            printBackground: true,
                          }),
                          new Promise((_, reject) =>
                            setTimeout(
                              () =>
                                reject(
                                  "TIMED_OUT, consider increasing CRAWLER_SCREENSHOT_TIMEOUT_SEC",
                                ),
                              serverConfig.crawler.screenshotTimeoutSec * 1000,
                            ),
                          ),
                          abortPromise(abortSignal).then(() => Buffer.from("")),
                        ]),
                      );
                      abortSignal.throwIfAborted();
                      if (pdfError) {
                        logger.warn(
                          `[Crawler][${jobId}] Failed to capture the PDF. Reason: ${pdfError}`,
                        );
                        return undefined;
                      }
                      setSpanAttributes({
                        "asset.size": pdfData.byteLength,
                      });
                      logger.info(
                        `[Crawler][${jobId}] Finished capturing page content as PDF`,
                      );
                      return pdfData;
                    },
                  )
                : Promise.resolve(undefined);

            const captureResults = await Promise.all([
              htmlPromise,
              screenshotPromise,
              pdfPromise,
            ] as const);
            abortSignal.throwIfAborted();
            return captureResults;
          },
        );

        return {
          htmlContent,
          statusCode: response?.status() ?? 0,
          screenshot,
          pdf,
          url: activePage.url(),
        };
      } finally {
        await withSpan(
          tracer,
          "crawlerWorker.crawlPage.cleanup",
          {
            attributes: {
              "job.id": jobId,
              "crawler.cleanup.hasPage": !!page,
            },
          },
          async () => {
            // Explicitly close the page first (with timeout) to release resources
            // even if context.close() later hangs.
            if (page) {
              const pageToClose = page;
              const pageClosed = await withSpan(
                tracer,
                "crawlerWorker.crawlPage.cleanup.closePage",
                { attributes: { "job.id": jobId } },
                async () =>
                  Promise.race([
                    pageToClose
                      .close()
                      .then(() => true)
                      .catch((e: unknown) => {
                        logger.warn(
                          `[Crawler][${jobId}] page.close() failed: ${e}`,
                        );
                        return true;
                      }),
                    new Promise<false>((r) =>
                      setTimeout(() => r(false), PAGE_CLOSE_TIMEOUT_MS),
                    ),
                  ]),
              );
              setSpanAttributes({ "crawler.cleanup.pageClosed": pageClosed });
              if (!pageClosed) {
                logger.warn(`[Crawler][${jobId}] page.close() timed out`);
              }
            }

            // Close the context (with timeout) to avoid hanging on in-flight ops.
            // Only remove from tracking if close actually succeeded; otherwise
            // the reaper will retry the close later.
            const contextClosed = await withSpan(
              tracer,
              "crawlerWorker.crawlPage.cleanup.closeContext",
              { attributes: { "job.id": jobId } },
              async () =>
                Promise.race([
                  context
                    .close()
                    .then(() => true)
                    .catch((e: unknown) => {
                      logger.warn(
                        `[Crawler][${jobId}] context.close() failed: ${e}`,
                      );
                      return true; // Error means it's likely already closed
                    }),
                  new Promise<false>((r) =>
                    setTimeout(() => r(false), CONTEXT_CLOSE_TIMEOUT_MS),
                  ),
                ]),
            );
            setSpanAttributes({
              "crawler.cleanup.contextClosed": contextClosed,
            });

            if (contextClosed) {
              activeContexts.delete(jobId);
            } else {
              logger.warn(
                `[Crawler][${jobId}] context.close() timed out — leaving in active set for reaper`,
              );
            }

            // Only close the browser if it was created on demand
            if (serverConfig.crawler.browserConnectOnDemand) {
              await withSpan(
                tracer,
                "crawlerWorker.crawlPage.cleanup.closeBrowser",
                { attributes: { "job.id": jobId } },
                async () =>
                  browser
                    .close()
                    .then(() => {
                      activeContexts.delete(jobId);
                    })
                    .catch((e: unknown) => {
                      logger.warn(
                        `[Crawler][${jobId}] browser.close() failed: ${e}`,
                      );
                    }),
              );
            }
          },
        );
      }
    },
  );
}

function getSubprocessScriptPath(): string {
  const currentUrl = import.meta.url;
  if (currentUrl.includes("/dist/")) {
    // Production: running from built output
    return new URL("./scripts/parseHtmlSubprocess.js", currentUrl).pathname;
  }
  // Dev mode: running via tsx
  return new URL("../scripts/parseHtmlSubprocess.ts", currentUrl).pathname;
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

async function runParseSubprocess(
  htmlContent: string,
  url: string,
  jobId: string,
  abortSignal: AbortSignal,
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
        `[Crawler][${jobId}] Spawning parse subprocess for "${url}" ...`,
      );

      const { cmd, args } = getSubprocessCommand();
      const timeoutMs = serverConfig.crawler.parseTimeoutSec * 1000;

      const result = await execa({
        input: JSON.stringify({ htmlContent, url, jobId }),
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

async function storeScreenshot(
  screenshot: Buffer | undefined,
  userId: string,
  jobId: string,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.storeScreenshot",
    {
      attributes: {
        "job.id": jobId,
        "user.id": userId,
        "asset.size": screenshot?.byteLength ?? 0,
      },
    },
    async () => {
      if (!serverConfig.crawler.storeScreenshot) {
        logger.info(
          `[Crawler][${jobId}] Skipping storing the screenshot as per the config.`,
        );
        return null;
      }
      if (!screenshot) {
        logger.info(
          `[Crawler][${jobId}] Skipping storing the screenshot as it's empty.`,
        );
        return null;
      }
      const assetId = newAssetId();
      const contentType = "image/jpeg";
      const fileName = "screenshot.jpeg";

      // Check storage quota before saving the screenshot
      const { data: quotaApproved, error: quotaError } = await tryCatch(
        QuotaService.checkStorageQuota(db, userId, screenshot.byteLength),
      );

      if (quotaError) {
        logger.warn(
          `[Crawler][${jobId}] Skipping screenshot storage due to quota exceeded: ${quotaError.message}`,
        );
        return null;
      }

      await saveAsset({
        userId,
        assetId,
        metadata: { contentType, fileName },
        asset: screenshot,
        quotaApproved,
      });
      logger.info(
        `[Crawler][${jobId}] Stored the screenshot as assetId: ${assetId} (${screenshot.byteLength} bytes)`,
      );
      return { assetId, contentType, fileName, size: screenshot.byteLength };
    },
  );
}

async function storePdf(
  pdf: Buffer | undefined,
  userId: string,
  jobId: string,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.storePdf",
    {
      attributes: {
        "job.id": jobId,
        "user.id": userId,
        "asset.size": pdf?.byteLength ?? 0,
      },
    },
    async () => {
      if (!pdf) {
        logger.info(
          `[Crawler][${jobId}] Skipping storing the PDF as it's empty.`,
        );
        return null;
      }
      const assetId = newAssetId();
      const contentType = "application/pdf";
      const fileName = "page.pdf";

      // Check storage quota before saving the PDF
      const { data: quotaApproved, error: quotaError } = await tryCatch(
        QuotaService.checkStorageQuota(db, userId, pdf.byteLength),
      );

      if (quotaError) {
        logger.warn(
          `[Crawler][${jobId}] Skipping PDF storage due to quota exceeded: ${quotaError.message}`,
        );
        return null;
      }

      await saveAsset({
        userId,
        assetId,
        metadata: { contentType, fileName },
        asset: pdf,
        quotaApproved,
      });
      logger.info(
        `[Crawler][${jobId}] Stored the PDF as assetId: ${assetId} (${pdf.byteLength} bytes)`,
      );
      return { assetId, contentType, fileName, size: pdf.byteLength };
    },
  );
}

async function downloadAndStoreFile(
  url: string,
  userId: string,
  jobId: string,
  fileType: string,
  abortSignal: AbortSignal,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.downloadAndStoreFile",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
        "user.id": userId,
        "asset.type": fileType,
      },
    },
    async () => {
      let assetPath: string | undefined;
      try {
        logger.info(
          `[Crawler][${jobId}] Downloading ${fileType} from "${url.length > 100 ? url.slice(0, 100) + "..." : url}"`,
        );
        const response = await fetchWithProxy(url, {
          signal: abortSignal,
        });
        if (!response.ok || response.body == null) {
          throw new Error(`Failed to download ${fileType}: ${response.status}`);
        }

        const contentType = normalizeContentType(
          response.headers.get("content-type"),
        );
        if (!contentType) {
          throw new Error("No content type in the response");
        }

        const assetId = newAssetId();
        assetPath = path.join(os.tmpdir(), assetId);

        let bytesRead = 0;
        const contentLengthEnforcer = new Transform({
          transform(chunk, _, callback) {
            bytesRead += chunk.length;

            if (abortSignal.aborted) {
              callback(new Error("AbortError"));
            } else if (bytesRead > serverConfig.maxAssetSizeMb * 1024 * 1024) {
              callback(
                new Error(
                  `Content length exceeds maximum allowed size: ${serverConfig.maxAssetSizeMb}MB`,
                ),
              );
            } else {
              callback(null, chunk); // pass data along unchanged
            }
          },
          flush(callback) {
            callback();
          },
        });

        await pipeline(
          response.body,
          contentLengthEnforcer,
          fsSync.createWriteStream(assetPath),
        );

        // Check storage quota before saving the asset
        const { data: quotaApproved, error: quotaError } = await tryCatch(
          QuotaService.checkStorageQuota(db, userId, bytesRead),
        );

        if (quotaError) {
          logger.warn(
            `[Crawler][${jobId}] Skipping ${fileType} storage due to quota exceeded: ${quotaError.message}`,
          );
          return null;
        }

        await saveAssetFromFile({
          userId,
          assetId,
          metadata: { contentType },
          assetPath,
          quotaApproved,
        });

        logger.info(
          `[Crawler][${jobId}] Downloaded ${fileType} as assetId: ${assetId} (${bytesRead} bytes)`,
        );

        return { assetId, userId, contentType, size: bytesRead };
      } catch (e) {
        logger.error(
          `[Crawler][${jobId}] Failed to download and store ${fileType}: ${e}`,
        );
        return null;
      } finally {
        if (assetPath) {
          await tryCatch(fs.unlink(assetPath));
        }
      }
    },
  );
}

async function downloadAndStoreImage(
  url: string,
  userId: string,
  jobId: string,
  abortSignal: AbortSignal,
) {
  if (!serverConfig.crawler.downloadBannerImage) {
    logger.info(
      `[Crawler][${jobId}] Skipping downloading the image as per the config.`,
    );
    return null;
  }
  return downloadAndStoreFile(url, userId, jobId, "image", abortSignal);
}

async function archiveWebpage(
  html: string,
  url: string,
  userId: string,
  jobId: string,
  abortSignal: AbortSignal,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.archiveWebpage",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
        "user.id": userId,
      },
    },
    async () => {
      logger.info(`[Crawler][${jobId}] Will attempt to archive page ...`);
      const assetId = newAssetId();
      const assetPath = path.join(os.tmpdir(), assetId);

      let res = await execa({
        input: html,
        cancelSignal: abortSignal,
        env: {
          https_proxy: serverConfig.proxy.httpsProxy
            ? getRandomProxy(serverConfig.proxy.httpsProxy)
            : undefined,
          http_proxy: serverConfig.proxy.httpProxy
            ? getRandomProxy(serverConfig.proxy.httpProxy)
            : undefined,
          no_proxy: serverConfig.proxy.noProxy?.join(","),
        },
      })("monolith", ["-", "-Ije", "-t", "5", "-b", url, "-o", assetPath]);

      if (res.isCanceled) {
        logger.error(
          `[Crawler][${jobId}] Canceled archiving the page as we hit global timeout.`,
        );
        await tryCatch(fs.unlink(assetPath));
        return null;
      }

      if (res.exitCode !== 0) {
        logger.error(
          `[Crawler][${jobId}] Failed to archive the page as the command exited with code ${res.exitCode}`,
        );
        await tryCatch(fs.unlink(assetPath));
        return null;
      }

      const contentType = "text/html";

      // Get file size and check quota before saving
      const stats = await fs.stat(assetPath);
      const fileSize = stats.size;

      const { data: quotaApproved, error: quotaError } = await tryCatch(
        QuotaService.checkStorageQuota(db, userId, fileSize),
      );

      if (quotaError) {
        logger.warn(
          `[Crawler][${jobId}] Skipping page archive storage due to quota exceeded: ${quotaError.message}`,
        );
        await tryCatch(fs.unlink(assetPath));
        return null;
      }

      await saveAssetFromFile({
        userId,
        assetId,
        assetPath,
        metadata: {
          contentType,
        },
        quotaApproved,
      });

      logger.info(
        `[Crawler][${jobId}] Done archiving the page as assetId: ${assetId}`,
      );

      return {
        assetId,
        contentType,
        size: await getAssetSize({ userId, assetId }),
      };
    },
  );
}

async function getContentType(
  url: string,
  jobId: string,
  abortSignal: AbortSignal,
): Promise<string | null> {
  return await withSpan(
    tracer,
    "crawlerWorker.getContentType",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
      },
    },
    async () => {
      try {
        logger.info(
          `[Crawler][${jobId}] Attempting to determine the content-type for the url ${url}`,
        );
        const response = await fetchWithProxy(url, {
          method: "GET",
          signal: AbortSignal.any([AbortSignal.timeout(5000), abortSignal]),
        });
        setSpanAttributes({
          "crawler.getContentType.statusCode": response.status,
        });
        const rawContentType = response.headers.get("content-type");
        const contentType = normalizeContentType(rawContentType);
        setSpanAttributes({
          "crawler.contentType": contentType ?? undefined,
        });
        logger.info(
          `[Crawler][${jobId}] Content-type for the url ${url} is "${contentType}"`,
        );
        return contentType;
      } catch (e) {
        logger.error(
          `[Crawler][${jobId}] Failed to determine the content-type for the url ${url}: ${e}`,
        );
        return null;
      }
    },
  );
}

/**
 * Downloads the asset from the URL and transforms the linkBookmark to an assetBookmark
 * @param url the url the user provided
 * @param assetType the type of the asset we're downloading
 * @param userId the id of the user
 * @param jobId the id of the job for logging
 * @param bookmarkId the id of the bookmark
 */
async function handleAsAssetBookmark(
  url: string,
  assetType: "image" | "pdf",
  userId: string,
  jobId: string,
  bookmarkId: string,
  abortSignal: AbortSignal,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.handleAsAssetBookmark",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
        "user.id": userId,
        "bookmark.id": bookmarkId,
        "asset.type": assetType,
      },
    },
    async () => {
      const downloaded = await downloadAndStoreFile(
        url,
        userId,
        jobId,
        assetType,
        abortSignal,
      );
      if (!downloaded) {
        return;
      }
      const fileName = path.basename(new URL(url).pathname);
      await db.transaction(async (trx) => {
        await updateAsset(
          undefined,
          {
            id: downloaded.assetId,
            bookmarkId,
            userId,
            assetType: AssetTypes.BOOKMARK_ASSET,
            contentType: downloaded.contentType,
            size: downloaded.size,
            fileName,
          },
          trx,
        );
        await trx.insert(bookmarkAssets).values({
          id: bookmarkId,
          assetType,
          assetId: downloaded.assetId,
          content: null,
          fileName,
          sourceUrl: url,
        });
        // Switch the type of the bookmark from LINK to ASSET
        await trx
          .update(bookmarks)
          .set({ type: BookmarkTypes.ASSET })
          .where(eq(bookmarks.id, bookmarkId));
        await trx.delete(bookmarkLinks).where(eq(bookmarkLinks.id, bookmarkId));
      });
      await AssetPreprocessingQueue.enqueue(
        {
          bookmarkId,
          fixMode: false,
        },
        {
          groupId: userId,
        },
      );
    },
  );
}

type StoreHtmlResult =
  | { result: "stored"; assetId: string; size: number }
  | { result: "store_inline" }
  | { result: "not_stored" };

async function storeHtmlContent(
  htmlContent: string | undefined,
  userId: string,
  jobId: string,
): Promise<StoreHtmlResult> {
  return await withSpan(
    tracer,
    "crawlerWorker.storeHtmlContent",
    {
      attributes: {
        "job.id": jobId,
        "user.id": userId,
        "bookmark.content.size": htmlContent
          ? Buffer.byteLength(htmlContent, "utf8")
          : 0,
      },
    },
    async () => {
      if (!htmlContent) {
        return { result: "not_stored" };
      }

      const contentSize = Buffer.byteLength(htmlContent, "utf8");

      // Only store in assets if content is >= 50KB
      if (contentSize < serverConfig.crawler.htmlContentSizeThreshold) {
        logger.info(
          `[Crawler][${jobId}] HTML content size (${contentSize} bytes) is below threshold, storing inline`,
        );
        return { result: "store_inline" };
      }

      const { data: quotaApproved, error: quotaError } = await tryCatch(
        QuotaService.checkStorageQuota(db, userId, contentSize),
      );
      if (quotaError) {
        logger.warn(
          `[Crawler][${jobId}] Skipping HTML content storage due to quota exceeded: ${quotaError.message}`,
        );
        return { result: "not_stored" };
      }

      const assetId = newAssetId();

      const { error: saveError } = await tryCatch(
        saveAsset({
          userId,
          assetId,
          asset: Buffer.from(htmlContent, "utf8"),
          metadata: {
            contentType: ASSET_TYPES.TEXT_HTML,
            fileName: null,
          },
          quotaApproved,
        }),
      );
      if (saveError) {
        logger.error(
          `[Crawler][${jobId}] Failed to store HTML content as asset: ${saveError}`,
        );
        throw saveError;
      }

      logger.info(
        `[Crawler][${jobId}] Stored large HTML content (${contentSize} bytes) as asset: ${assetId}`,
      );

      return {
        result: "stored",
        assetId,
        size: contentSize,
      };
    },
  );
}

async function crawlAndParseUrl(
  url: string,
  userId: string,
  jobId: string,
  bookmarkId: string,
  oldScreenshotAssetId: string | undefined,
  oldPdfAssetId: string | undefined,
  oldImageAssetId: string | undefined,
  oldFullPageArchiveAssetId: string | undefined,
  oldContentAssetId: string | undefined,
  precrawledArchiveAssetId: string | undefined,
  archiveFullPage: boolean,
  forceStorePdf: boolean,
  numRetriesLeft: number,
  abortSignal: AbortSignal,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.crawlAndParseUrl",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
        "user.id": userId,
        "bookmark.id": bookmarkId,
        "crawler.archiveFullPage": archiveFullPage,
        "crawler.forceStorePdf": forceStorePdf,
        "crawler.hasPrecrawledArchive": !!precrawledArchiveAssetId,
      },
    },
    async () => {
      let result: {
        htmlContent: string;
        screenshot: Buffer | undefined;
        pdf: Buffer | undefined;
        statusCode: number | null;
        url: string;
      };

      if (precrawledArchiveAssetId) {
        logger.info(
          `[Crawler][${jobId}] The page has been precrawled. Will use the precrawled archive instead.`,
        );
        const asset = await readAsset({
          userId,
          assetId: precrawledArchiveAssetId,
        });
        result = {
          htmlContent: asset.asset.toString(),
          screenshot: undefined,
          pdf: undefined,
          statusCode: 200,
          url,
        };
      } else {
        result = await crawlPage(
          jobId,
          url,
          userId,
          forceStorePdf,
          abortSignal,
        );
      }
      abortSignal.throwIfAborted();

      const {
        htmlContent,
        screenshot,
        pdf,
        statusCode,
        url: browserUrl,
      } = result;

      // Track status code in Prometheus
      if (statusCode !== null) {
        crawlerStatusCodeCounter.labels(statusCode.toString()).inc();
        setSpanAttributes({
          "crawler.statusCode": statusCode,
        });
      }

      if (shouldRetryCrawlStatusCode(statusCode)) {
        if (numRetriesLeft > 0) {
          throw new Error(
            `[Crawler][${jobId}] Received status code ${statusCode}. Will retry crawl. Retries left: ${numRetriesLeft}`,
          );
        }
        logger.info(
          `[Crawler][${jobId}] Received status code ${statusCode} on latest retry attempt. Proceeding without retry.`,
        );
      }

      const { metadata: meta, readableContent: parsedReadableContent } =
        await runParseSubprocess(htmlContent, browserUrl, jobId, abortSignal);
      abortSignal.throwIfAborted();

      const parseDate = (date: string | null | undefined) => {
        if (!date) {
          return null;
        }
        try {
          return new Date(date);
        } catch {
          return null;
        }
      };

      // Phase 1: Write metadata immediately for fast user feedback.
      // Content and asset storage happen later and can be slow (banner
      // image download, screenshot/pdf upload, etc.).
      await db
        .update(bookmarkLinks)
        .set({
          title: meta.title,
          description: meta.description,
          // Don't store data URIs as they're not valid URLs and are usually quite large
          imageUrl: meta.image?.startsWith("data:") ? null : meta.image,
          favicon: meta.logo,
          crawlStatusCode: statusCode,
          author: meta.author,
          publisher: meta.publisher,
          datePublished: parseDate(meta.datePublished),
          dateModified: parseDate(meta.dateModified),
        })
        .where(eq(bookmarkLinks.id, bookmarkId));

      let readableContent = parsedReadableContent;

      const screenshotAssetInfo = await Promise.race([
        storeScreenshot(screenshot, userId, jobId),
        abortPromise(abortSignal),
      ]);
      abortSignal.throwIfAborted();

      const pdfAssetInfo = await Promise.race([
        storePdf(pdf, userId, jobId),
        abortPromise(abortSignal),
      ]);
      abortSignal.throwIfAborted();

      const htmlContentAssetInfo = await storeHtmlContent(
        readableContent?.content,
        userId,
        jobId,
      );
      abortSignal.throwIfAborted();
      let imageAssetInfo: DBAssetType | null = null;
      if (meta.image) {
        const downloaded = await downloadAndStoreImage(
          meta.image,
          userId,
          jobId,
          abortSignal,
        );
        if (downloaded) {
          imageAssetInfo = {
            id: downloaded.assetId,
            bookmarkId,
            userId,
            assetType: AssetTypes.LINK_BANNER_IMAGE,
            contentType: downloaded.contentType,
            size: downloaded.size,
          };
        }
      }
      abortSignal.throwIfAborted();

      // Phase 2: Write content and asset references.
      // TODO(important): Restrict the size of content to store
      const assetDeletionTasks: Promise<void>[] = [];
      const inlineHtmlContent =
        htmlContentAssetInfo.result === "store_inline"
          ? (readableContent?.content ?? null)
          : null;
      readableContent = null;
      await db.transaction(async (txn) => {
        await txn
          .update(bookmarkLinks)
          .set({
            crawledAt: new Date(),
            htmlContent: inlineHtmlContent,
            contentAssetId:
              htmlContentAssetInfo.result === "stored"
                ? htmlContentAssetInfo.assetId
                : null,
          })
          .where(eq(bookmarkLinks.id, bookmarkId));

        if (screenshotAssetInfo) {
          await updateAsset(
            oldScreenshotAssetId,
            {
              id: screenshotAssetInfo.assetId,
              bookmarkId,
              userId,
              assetType: AssetTypes.LINK_SCREENSHOT,
              contentType: screenshotAssetInfo.contentType,
              size: screenshotAssetInfo.size,
              fileName: screenshotAssetInfo.fileName,
            },
            txn,
          );
          assetDeletionTasks.push(
            silentDeleteAsset(userId, oldScreenshotAssetId),
          );
        }
        if (pdfAssetInfo) {
          await updateAsset(
            oldPdfAssetId,
            {
              id: pdfAssetInfo.assetId,
              bookmarkId,
              userId,
              assetType: AssetTypes.LINK_PDF,
              contentType: pdfAssetInfo.contentType,
              size: pdfAssetInfo.size,
              fileName: pdfAssetInfo.fileName,
            },
            txn,
          );
          assetDeletionTasks.push(silentDeleteAsset(userId, oldPdfAssetId));
        }
        if (imageAssetInfo) {
          await updateAsset(oldImageAssetId, imageAssetInfo, txn);
          assetDeletionTasks.push(silentDeleteAsset(userId, oldImageAssetId));
        }
        if (htmlContentAssetInfo.result === "stored") {
          await updateAsset(
            oldContentAssetId,
            {
              id: htmlContentAssetInfo.assetId,
              bookmarkId,
              userId,
              assetType: AssetTypes.LINK_HTML_CONTENT,
              contentType: ASSET_TYPES.TEXT_HTML,
              size: htmlContentAssetInfo.size,
              fileName: null,
            },
            txn,
          );
          assetDeletionTasks.push(silentDeleteAsset(userId, oldContentAssetId));
        } else if (oldContentAssetId) {
          // Unlink the old content asset
          await txn.delete(assets).where(eq(assets.id, oldContentAssetId));
          assetDeletionTasks.push(silentDeleteAsset(userId, oldContentAssetId));
        }
      });

      // Delete the old assets if any
      await Promise.all(assetDeletionTasks);

      return async () => {
        if (
          !precrawledArchiveAssetId &&
          (serverConfig.crawler.fullPageArchive || archiveFullPage)
        ) {
          const archiveResult = await archiveWebpage(
            htmlContent,
            browserUrl,
            userId,
            jobId,
            abortSignal,
          );

          if (archiveResult) {
            const {
              assetId: fullPageArchiveAssetId,
              size,
              contentType,
            } = archiveResult;

            await db.transaction(async (txn) => {
              await updateAsset(
                oldFullPageArchiveAssetId,
                {
                  id: fullPageArchiveAssetId,
                  bookmarkId,
                  userId,
                  assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
                  contentType,
                  size,
                  fileName: null,
                },
                txn,
              );
            });
            if (oldFullPageArchiveAssetId) {
              await silentDeleteAsset(userId, oldFullPageArchiveAssetId);
            }
          }
        }
      };
    },
  );
}

/**
 * Checks if the domain should be rate limited and throws QueueRetryAfterError if needed.
 * @throws {QueueRetryAfterError} if the domain is rate limited
 */
async function checkDomainRateLimit(url: string, jobId: string): Promise<void> {
  return await withSpan(
    tracer,
    "crawlerWorker.checkDomainRateLimit",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
      },
    },
    async () => {
      const crawlerDomainRateLimitConfig =
        serverConfig.crawler.domainRatelimiting;
      if (!crawlerDomainRateLimitConfig) {
        return;
      }

      const rateLimitClient = await getRateLimitClient();
      if (!rateLimitClient) {
        return;
      }

      const hostname = new URL(url).hostname;
      const rateLimitResult = rateLimitClient.checkRateLimit(
        {
          name: "domain-ratelimit",
          maxRequests: crawlerDomainRateLimitConfig.maxRequests,
          windowMs: crawlerDomainRateLimitConfig.windowMs,
        },
        hostname,
      );

      if (!rateLimitResult.allowed) {
        const resetInSeconds = rateLimitResult.resetInSeconds;
        // Add jitter to prevent thundering herd: +40% random variation
        const jitterFactor = 1.0 + Math.random() * 0.4; // Random value between 1.0 and 1.4
        const delayMs = Math.floor(resetInSeconds * 1000 * jitterFactor);
        logger.info(
          `[Crawler][${jobId}] Domain "${hostname}" is rate limited. Will retry in ${(delayMs / 1000).toFixed(2)} seconds (with jitter).`,
        );
        throw new QueueRetryAfterError(
          `Domain "${hostname}" is rate limited`,
          delayMs,
        );
      }
    },
  );
}

async function runCrawler(
  job: DequeuedJob<ZCrawlLinkRequest>,
  maxRetries: number,
): Promise<CrawlerRunResult> {
  const jobId = `${job.id}:${job.runNumber}`;
  const numRetriesLeft = Math.max(maxRetries - job.runNumber, 0);

  const request = zCrawlLinkRequestSchema.safeParse(job.data);
  if (!request.success) {
    logger.error(
      `[Crawler][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
    return { status: "completed" };
  }

  const { bookmarkId, archiveFullPage, storePdf } = request.data;
  const {
    url,
    userId,
    createdAt,
    crawledAt,
    screenshotAssetId: oldScreenshotAssetId,
    pdfAssetId: oldPdfAssetId,
    imageAssetId: oldImageAssetId,
    fullPageArchiveAssetId: oldFullPageArchiveAssetId,
    contentAssetId: oldContentAssetId,
    precrawledArchiveAssetId,
  } = await getBookmarkDetails(bookmarkId);

  await checkDomainRateLimit(url, jobId);

  logger.info(
    `[Crawler][${jobId}] Will crawl "${url}" for link with id "${bookmarkId}"`,
  );

  const contentType = await getContentType(url, jobId, job.abortSignal);
  job.abortSignal.throwIfAborted();

  // Link bookmarks get transformed into asset bookmarks if they point to a supported asset instead of a webpage
  const isPdf = contentType === ASSET_TYPES.APPLICATION_PDF;

  if (isPdf) {
    await handleAsAssetBookmark(
      url,
      "pdf",
      userId,
      jobId,
      bookmarkId,
      job.abortSignal,
    );
  } else if (
    contentType &&
    IMAGE_ASSET_TYPES.has(contentType) &&
    SUPPORTED_UPLOAD_ASSET_TYPES.has(contentType)
  ) {
    await handleAsAssetBookmark(
      url,
      "image",
      userId,
      jobId,
      bookmarkId,
      job.abortSignal,
    );
  } else {
    const archivalLogic = await crawlAndParseUrl(
      url,
      userId,
      jobId,
      bookmarkId,
      oldScreenshotAssetId,
      oldPdfAssetId,
      oldImageAssetId,
      oldFullPageArchiveAssetId,
      oldContentAssetId,
      precrawledArchiveAssetId,
      archiveFullPage,
      storePdf ?? false,
      numRetriesLeft,
      job.abortSignal,
    );

    // Propagate priority to child jobs
    const enqueueOpts: EnqueueOptions = {
      priority: job.priority,
      groupId: userId,
    };

    // Enqueue openai job (if not set, assume it's true for backward compatibility)
    if (job.data.runInference !== false) {
      await OpenAIQueue.enqueue(
        {
          bookmarkId,
          type: "tag",
        },
        enqueueOpts,
      );
      await OpenAIQueue.enqueue(
        {
          bookmarkId,
          type: "summarize",
        },
        enqueueOpts,
      );
    }

    // Update the search index
    await triggerSearchReindex(bookmarkId, enqueueOpts);

    if (serverConfig.crawler.downloadVideo) {
      // Trigger a potential download of a video from the URL
      await VideoWorkerQueue.enqueue(
        {
          bookmarkId,
          url,
        },
        enqueueOpts,
      );
    }

    // Trigger a webhook
    await triggerWebhook(bookmarkId, "crawled", undefined, enqueueOpts);

    // Do the archival as a separate last step as it has the potential for failure
    await archivalLogic();
  }

  // Record the latency from bookmark creation to crawl completion.
  // Only for first-time, high-priority crawls (excludes recrawls and imports).
  if (crawledAt === null && job.priority === 0) {
    const latencySeconds = (Date.now() - createdAt.getTime()) / 1000;
    bookmarkCrawlLatencyHistogram.observe(latencySeconds);
  }

  return { status: "completed" };
}
