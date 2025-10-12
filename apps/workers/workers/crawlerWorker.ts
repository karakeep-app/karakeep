import * as dns from "dns";
import { promises as fs } from "fs";
import * as fsSync from "fs";
import * as path from "node:path";
import * as os from "os";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { PlaywrightBlocker } from "@ghostery/adblocker-playwright";
import { Readability } from "@mozilla/readability";
import { Mutex } from "async-mutex";
import DOMPurify from "dompurify";
import { eq } from "drizzle-orm";
import { execa } from "execa";
import { exitAbortController } from "exit";
import { JSDOM, VirtualConsole } from "jsdom";
import metascraper from "metascraper";
import metascraperAmazon from "metascraper-amazon";
import metascraperAuthor from "metascraper-author";
import metascraperDate from "metascraper-date";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperLogo from "metascraper-logo-favicon";
import metascraperPublisher from "metascraper-publisher";
import metascraperTitle from "metascraper-title";
import metascraperTwitter from "metascraper-twitter";
import metascraperUrl from "metascraper-url";
import { workerStatsCounter } from "metrics";
import { Browser, BrowserContextOptions } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { fetchWithProxy, getRandomProxy } from "utils";
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
  LinkCrawlerQueue,
  OpenAIQueue,
  QuotaService,
  triggerSearchReindex,
  triggerWebhook,
  VideoWorkerQueue,
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
  EnqueueOptions,
  getQueueClient,
} from "@karakeep/shared/queueing";
import { tryCatch } from "@karakeep/shared/tryCatch";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import metascraperReddit from "../metascraper-plugins/metascraper-reddit";

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

const metascraperParser = metascraper([
  metascraperDate({
    dateModified: true,
    datePublished: true,
  }),
  metascraperAmazon(),
  metascraperReddit(),
  metascraperAuthor(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperDescription(),
  metascraperTwitter(),
  metascraperImage(),
  metascraperLogo(),
  metascraperUrl(),
]);

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
    bypass: proxy.noProxy,
  };
}

let globalBrowser: Browser | undefined;
let globalBlocker: PlaywrightBlocker | undefined;
// Global variable to store parsed cookies
let globalCookies: Cookie[] = [];
// Guards the interactions with the browser instance.
// This is needed given that most of the browser APIs are async.
const browserMutex = new Mutex();

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
  static async build() {
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

    logger.info("Starting crawler worker ...");
    const worker = (await getQueueClient())!.createRunner<ZCrawlLinkRequest>(
      LinkCrawlerQueue,
      {
        run: runCrawler,
        onComplete: async (job) => {
          workerStatsCounter.labels("crawler", "completed").inc();
          const jobId = job.id;
          logger.info(`[Crawler][${jobId}] Completed successfully`);
          const bookmarkId = job.data.bookmarkId;
          if (bookmarkId) {
            await changeBookmarkStatus(bookmarkId, "success");
          }
        },
        onError: async (job) => {
          workerStatsCounter.labels("crawler", "failed").inc();
          const jobId = job.id;
          logger.error(
            `[Crawler][${jobId}] Crawling job failed: ${job.error}\n${job.error.stack}`,
          );
          const bookmarkId = job.data?.bookmarkId;
          if (bookmarkId && job.numRetriesLeft == 0) {
            await changeBookmarkStatus(bookmarkId, "failure");
          }
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.crawler.jobTimeoutSec,
        concurrency: serverConfig.crawler.numWorkers,
      },
    );

    await loadCookiesFromFile();

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

async function changeBookmarkStatus(
  bookmarkId: string,
  crawlStatus: "success" | "failure",
) {
  await db
    .update(bookmarkLinks)
    .set({
      crawlStatus,
    })
    .where(eq(bookmarkLinks.id, bookmarkId));
}

/**
 * This provides some "basic" protection from malicious URLs. However, all of those
 * can be easily circumvented by pointing dns of origin to localhost, or with
 * redirects.
 */
function validateUrl(url: string) {
  const urlParsed = new URL(url);
  if (urlParsed.protocol != "http:" && urlParsed.protocol != "https:") {
    throw new Error(`Unsupported URL protocol: ${urlParsed.protocol}`);
  }

  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(urlParsed.hostname)) {
    throw new Error(`Link hostname rejected: ${urlParsed.hostname}`);
  }
}

async function browserlessCrawlPage(
  jobId: string,
  url: string,
  abortSignal: AbortSignal,
) {
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
    url: response.url,
  };
}

async function crawlPage(
  jobId: string,
  url: string,
  userId: string,
  abortSignal: AbortSignal,
): Promise<{
  htmlContent: string;
  screenshot: Buffer | undefined;
  statusCode: number;
  url: string;
}> {
  // Check user's browser crawling setting
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
  if (serverConfig.crawler.browserConnectOnDemand) {
    browser = await startBrowserInstance();
  } else {
    browser = globalBrowser;
  }
  if (!browser) {
    return browserlessCrawlPage(jobId, url, abortSignal);
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    proxy: getPlaywrightProxyConfig(),
  });

  try {
    if (globalCookies.length > 0) {
      await context.addCookies(globalCookies);
      logger.info(
        `[Crawler][${jobId}] Cookies successfully loaded into browser context`,
      );
    }

    // Create a new page in the context
    const page = await context.newPage();

    // Apply ad blocking
    if (globalBlocker) {
      await globalBlocker.enableBlockingInPage(page);
    }

    // Block audio/video resources
    await page.route("**/*", (route) => {
      const request = route.request();
      const resourceType = request.resourceType();

      // Block audio/video resources
      if (
        resourceType === "media" ||
        request.headers()["content-type"]?.includes("video/") ||
        request.headers()["content-type"]?.includes("audio/")
      ) {
        route.abort();
        return;
      }

      // Continue with other requests
      route.continue();
    });

    // Navigate to the target URL
    logger.info(`[Crawler][${jobId}] Navigating to "${url}"`);
    const response = await Promise.race([
      page.goto(url, {
        timeout: serverConfig.crawler.navigateTimeoutSec * 1000,
        waitUntil: "domcontentloaded",
      }),
      abortPromise(abortSignal).then(() => null),
    ]);

    logger.info(
      `[Crawler][${jobId}] Successfully navigated to "${url}". Waiting for the page to load ...`,
    );

    // Wait until network is relatively idle or timeout after 5 seconds
    await Promise.race([
      page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => ({})),
      new Promise((resolve) => setTimeout(resolve, 5000)),
      abortPromise(abortSignal),
    ]);

    abortSignal.throwIfAborted();

    logger.info(`[Crawler][${jobId}] Finished waiting for the page to load.`);

    // Extract content from the page
    const htmlContent = await page.content();

    abortSignal.throwIfAborted();

    logger.info(`[Crawler][${jobId}] Successfully fetched the page content.`);

    // Take a screenshot if configured
    let screenshot: Buffer | undefined = undefined;
    if (serverConfig.crawler.storeScreenshot) {
      const { data: screenshotData, error: screenshotError } = await tryCatch(
        Promise.race<Buffer>([
          page.screenshot({
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
      } else {
        logger.info(
          `[Crawler][${jobId}] Finished capturing page content and a screenshot. FullPageScreenshot: ${serverConfig.crawler.fullPageScreenshot}`,
        );
        screenshot = screenshotData;
      }
    }

    return {
      htmlContent,
      statusCode: response?.status() ?? 0,
      screenshot,
      url: page.url(),
    };
  } finally {
    await context.close();
    // Only close the browser if it was created on demand
    if (serverConfig.crawler.browserConnectOnDemand) {
      await browser.close();
    }
  }
}

async function extractMetadata(
  htmlContent: string,
  url: string,
  jobId: string,
) {
  logger.info(
    `[Crawler][${jobId}] Will attempt to extract metadata from page ...`,
  );
  const meta = await metascraperParser({
    url,
    html: htmlContent,
    // We don't want to validate the URL again as we've already done it by visiting the page.
    // This was added because URL validation fails if the URL ends with a question mark (e.g. empty query params).
    validateUrl: false,
  });
  logger.info(`[Crawler][${jobId}] Done extracting metadata from the page.`);
  return meta;
}

function extractReadableContent(
  htmlContent: string,
  url: string,
  jobId: string,
) {
  logger.info(
    `[Crawler][${jobId}] Will attempt to extract readable content ...`,
  );
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(htmlContent, { url, virtualConsole });
  const readableContent = new Readability(dom.window.document).parse();
  if (!readableContent || typeof readableContent.content !== "string") {
    return null;
  }

  const window = new JSDOM("").window;
  const purify = DOMPurify(window);
  const purifiedHTML = purify.sanitize(readableContent.content);

  logger.info(`[Crawler][${jobId}] Done extracting readable content.`);
  return {
    content: purifiedHTML,
    textContent: readableContent.textContent,
  };
}

async function storeScreenshot(
  screenshot: Buffer | undefined,
  userId: string,
  jobId: string,
) {
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
  const fileName = "screenshot.png";

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
}

async function downloadAndStoreFile(
  url: string,
  userId: string,
  jobId: string,
  fileType: string,
  abortSignal: AbortSignal,
) {
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
  logger.info(`[Crawler][${jobId}] Will attempt to archive page ...`);
  const assetId = newAssetId();
  const assetPath = path.join(os.tmpdir(), assetId);

  let res = await execa({
    input: html,
    cancelSignal: abortSignal,
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
}

async function getContentType(
  url: string,
  jobId: string,
  abortSignal: AbortSignal,
): Promise<string | null> {
  try {
    logger.info(
      `[Crawler][${jobId}] Attempting to determine the content-type for the url ${url}`,
    );
    const response = await fetchWithProxy(url, {
      method: "HEAD",
      signal: AbortSignal.any([AbortSignal.timeout(5000), abortSignal]),
    });
    const rawContentType = response.headers.get("content-type");
    const contentType = normalizeContentType(rawContentType);
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
  await AssetPreprocessingQueue.enqueue({
    bookmarkId,
    fixMode: false,
  });
}

const HTML_CONTENT_SIZE_THRESHOLD = 50 * 1024; // 50KB

type StoreHtmlResult =
  | { result: "stored"; assetId: string; size: number }
  | { result: "store_inline" }
  | { result: "not_stored" };

async function storeHtmlContent(
  htmlContent: string | undefined,
  userId: string,
  jobId: string,
): Promise<StoreHtmlResult> {
  if (!htmlContent) {
    return { result: "not_stored" };
  }

  const contentBuffer = Buffer.from(htmlContent, "utf8");
  const contentSize = contentBuffer.byteLength;

  // Only store in assets if content is >= 50KB
  if (contentSize < HTML_CONTENT_SIZE_THRESHOLD) {
    logger.info(
      `[Crawler][${jobId}] HTML content size (${contentSize} bytes) is below threshold, storing inline`,
    );
    return { result: "store_inline" };
  }

  const { data: quotaApproved, error: quotaError } = await tryCatch(
    QuotaService.checkStorageQuota(db, userId, contentBuffer.byteLength),
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
      asset: contentBuffer,
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
}

async function crawlAndParseUrl(
  url: string,
  userId: string,
  jobId: string,
  bookmarkId: string,
  oldScreenshotAssetId: string | undefined,
  oldImageAssetId: string | undefined,
  oldFullPageArchiveAssetId: string | undefined,
  oldContentAssetId: string | undefined,
  precrawledArchiveAssetId: string | undefined,
  archiveFullPage: boolean,
  abortSignal: AbortSignal,
) {
  let result: {
    htmlContent: string;
    screenshot: Buffer | undefined;
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
      statusCode: 200,
      url,
    };
  } else {
    result = await crawlPage(jobId, url, userId, abortSignal);
  }
  abortSignal.throwIfAborted();

  const { htmlContent, screenshot, statusCode, url: browserUrl } = result;

  const abortableWork = Promise.all([
    extractMetadata(htmlContent, browserUrl, jobId),
    extractReadableContent(htmlContent, browserUrl, jobId),
    storeScreenshot(screenshot, userId, jobId),
  ]);

  await Promise.race([abortableWork, abortPromise(abortSignal)]);

  const [meta, readableContent, screenshotAssetInfo] = await abortableWork;

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

  const parseDate = (date: string | undefined) => {
    if (!date) {
      return null;
    }
    try {
      return new Date(date);
    } catch {
      return null;
    }
  };

  // TODO(important): Restrict the size of content to store
  const assetDeletionTasks: Promise<void>[] = [];
  await db.transaction(async (txn) => {
    await txn
      .update(bookmarkLinks)
      .set({
        title: meta.title,
        description: meta.description,
        // Don't store data URIs as they're not valid URLs and are usually quite large
        imageUrl: meta.image?.startsWith("data:") ? null : meta.image,
        favicon: meta.logo,
        htmlContent:
          htmlContentAssetInfo.result === "store_inline"
            ? readableContent?.content
            : null,
        contentAssetId:
          htmlContentAssetInfo.result === "stored"
            ? htmlContentAssetInfo.assetId
            : null,
        crawledAt: new Date(),
        crawlStatusCode: statusCode,
        author: meta.author,
        publisher: meta.publisher,
        datePublished: parseDate(meta.datePublished),
        dateModified: parseDate(meta.dateModified),
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
      assetDeletionTasks.push(silentDeleteAsset(userId, oldScreenshotAssetId));
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
}

async function runCrawler(job: DequeuedJob<ZCrawlLinkRequest>) {
  const jobId = `${job.id}:${job.runNumber}`;

  const request = zCrawlLinkRequestSchema.safeParse(job.data);
  if (!request.success) {
    logger.error(
      `[Crawler][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
    return;
  }

  const { bookmarkId, archiveFullPage } = request.data;
  const {
    url,
    userId,
    screenshotAssetId: oldScreenshotAssetId,
    imageAssetId: oldImageAssetId,
    fullPageArchiveAssetId: oldFullPageArchiveAssetId,
    contentAssetId: oldContentAssetId,
    precrawledArchiveAssetId,
  } = await getBookmarkDetails(bookmarkId);

  logger.info(
    `[Crawler][${jobId}] Will crawl "${url}" for link with id "${bookmarkId}"`,
  );
  validateUrl(url);

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
      oldImageAssetId,
      oldFullPageArchiveAssetId,
      oldContentAssetId,
      precrawledArchiveAssetId,
      archiveFullPage,
      job.abortSignal,
    );

    // Propagate priority to child jobs
    const enqueueOpts: EnqueueOptions = {
      priority: job.priority,
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
}
