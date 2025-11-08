import * as dns from "dns";
import { promises as fs } from "fs";
import * as path from "node:path";
import * as os from "os";
import { PlaywrightBlocker } from "@ghostery/adblocker-playwright";
import { Mutex } from "async-mutex";
import { Browser, BrowserContextOptions } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { z } from "zod";

import type { PluginProvider } from "@karakeep/shared/plugins";
import type { CrawlerClient, CrawlOptions, CrawlResult } from "@karakeep/shared/crawler";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { tryCatch } from "@karakeep/shared/tryCatch";
import {
  fetchWithProxy,
  getRandomProxy,
  matchesNoProxy,
  validateUrl,
  exitAbortController,
} from "@karakeep/shared-server";

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

async function startBrowserInstance() {
  if (serverConfig.crawler.browserWebSocketUrl) {
    logger.info(
      `[Crawler][Browser] Connecting to existing browser websocket address: ${serverConfig.crawler.browserWebSocketUrl}`,
    );
    return await chromium.connect(serverConfig.crawler.browserWebSocketUrl, {
      // Important: using slowMo to ensure stability with remote browser
      slowMo: 100,
      timeout: 5000,
    });
  } else if (serverConfig.crawler.browserWebUrl) {
    logger.info(
      `[Crawler][Browser] Connecting to existing browser instance: ${serverConfig.crawler.browserWebUrl}`,
    );

    const webUrl = new URL(serverConfig.crawler.browserWebUrl);
    const { address } = await dns.promises.lookup(webUrl.hostname);
    webUrl.hostname = address;
    logger.info(
      `[Crawler][Browser] Successfully resolved IP address, new address: ${webUrl.toString()}`,
    );

    return await chromium.connectOverCDP(webUrl.toString(), {
      // Important: using slowMo to ensure stability with remote browser
      slowMo: 100,
      timeout: 5000,
    });
  } else {
    logger.info(`[Crawler][Browser] No browser configured, running in browserless mode`);
    return undefined;
  }
}

async function launchBrowser() {
  globalBrowser = undefined;
  await browserMutex.runExclusive(async () => {
    const globalBrowserResult = await tryCatch(startBrowserInstance());
    if (globalBrowserResult.error) {
      logger.error(
        `[Crawler][Browser] Failed to connect to the browser instance, will retry in 5 secs: ${globalBrowserResult.error.stack}`,
      );
      if (exitAbortController.signal.aborted) {
        logger.info("[Crawler][Browser] We're shutting down so won't retry.");
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
          "[Crawler][Browser] The Playwright browser got disconnected. But we're shutting down so won't restart it.",
        );
        return;
      }
      logger.info(
        "[Crawler][Browser] The Playwright browser got disconnected. Will attempt to launch it again.",
      );
      launchBrowser();
    });
  });
}

async function loadCookiesFromFile(): Promise<void> {
  try {
    const path = serverConfig.crawler.browserCookiePath;
    if (!path) {
      logger.info(
        "[Crawler][Browser] Not defined in the server configuration BROWSER_COOKIE_PATH",
      );
      return;
    }
    const data = await fs.readFile(path, "utf8");
    const cookies = JSON.parse(data);
    globalCookies = cookiesSchema.parse(cookies);
  } catch (error) {
    logger.error("Failed to read or parse cookies file:", error);
    if (error instanceof z.ZodError) {
      logger.error("[Crawler][Browser] Invalid cookie file format:", error.errors);
    } else {
      logger.error("[Crawler][Browser] Failed to read or parse cookies file:", error);
    }
    throw error;
  }
}

export class BrowserCrawlerClient implements CrawlerClient {
  async crawl(url: string, options: CrawlOptions): Promise<CrawlResult> {
    const { jobId, abortSignal } = options;

    let browser: Browser | undefined;
    if (serverConfig.crawler.browserConnectOnDemand) {
      browser = await startBrowserInstance();
    } else {
      browser = globalBrowser;
    }
    if (!browser) {
      throw new Error("Browser is not available");
    }

    const proxyConfig = getPlaywrightProxyConfig();
    const isRunningInProxyContext =
      proxyConfig !== undefined &&
      !matchesNoProxy(url, proxyConfig.bypass?.split(",") ?? []);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      proxy: proxyConfig,
    });

    try {
      if (globalCookies.length > 0) {
        await context.addCookies(globalCookies);
        logger.info(
          `[Crawler][Browser][${jobId}] Cookies successfully loaded into browser context`,
        );
      }

      // Create a new page in the context
      const page = await context.newPage();

      // Apply ad blocking
      if (globalBlocker) {
        await globalBlocker.enableBlockingInPage(page);
      }

      // Block audio/video resources and disallowed sub-requests
      await page.route("**/*", async (route) => {
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
          !matchesNoProxy(requestUrl, proxyConfig.bypass?.split(",") ?? []);
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
              `[Crawler][Browser][${jobId}] Blocking sub-request to disallowed URL "${requestUrl}": ${validation.reason}`,
            );
            await route.abort("blockedbyclient");
            return;
          }
        }

        // Continue with other requests
        await route.continue();
      });

      // Navigate to the target URL
      const navigationValidation = await validateUrl(
        url,
        isRunningInProxyContext,
      );
      if (!navigationValidation.ok) {
        throw new Error(
          `Disallowed navigation target "${url}": ${navigationValidation.reason}`,
        );
      }
      const targetUrl = navigationValidation.url.toString();
      logger.info(`[Crawler][Browser][${jobId}] Navigating to "${targetUrl}"`);
      const response = await Promise.race([
        page.goto(targetUrl, {
          timeout: serverConfig.crawler.navigateTimeoutSec * 1000,
          waitUntil: "domcontentloaded",
        }),
        abortPromise(abortSignal).then(() => null),
      ]);

      logger.info(
        `[Crawler][Browser][${jobId}] Successfully navigated to "${targetUrl}". Waiting for the page to load ...`,
      );

      // Wait until network is relatively idle or timeout after 5 seconds
      await Promise.race([
        page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => ({})),
        new Promise((resolve) => setTimeout(resolve, 5000)),
        abortPromise(abortSignal),
      ]);

      abortSignal.throwIfAborted();

      logger.info(`[Crawler][Browser][${jobId}] Finished waiting for the page to load.`);

      // Extract content from the page
      const htmlContent = await page.content();

      abortSignal.throwIfAborted();

      logger.info(`[Crawler][Browser][${jobId}] Successfully fetched the page content.`);

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
            `[Crawler][Browser][${jobId}] Failed to capture the screenshot. Reason: ${screenshotError}`,
          );
        } else {
          logger.info(
            `[Crawler][Browser][${jobId}] Finished capturing page content and a screenshot. FullPageScreenshot: ${serverConfig.crawler.fullPageScreenshot}`,
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

  async initialize(): Promise<void> {
    chromium.use(StealthPlugin());
    if (serverConfig.crawler.enableAdblocker) {
      logger.info("[Crawler][Browser] Loading adblocker ...");
      const globalBlockerResult = await tryCatch(
        PlaywrightBlocker.fromPrebuiltFull(fetchWithProxy, {
          path: path.join(os.tmpdir(), "karakeep_adblocker.bin"),
          read: fs.readFile,
          write: fs.writeFile,
        }),
      );
      if (globalBlockerResult.error) {
        logger.error(
          `[Crawler][Browser] Failed to load adblocker. Will not be blocking ads: ${globalBlockerResult.error}`,
        );
      } else {
        globalBlocker = globalBlockerResult.data;
      }
    }
    if (!serverConfig.crawler.browserConnectOnDemand) {
      await launchBrowser();
    } else {
      logger.info(
        "[Crawler][Browser] Browser connect on demand is enabled, won't proactively start the browser instance",
      );
    }

    await loadCookiesFromFile();
  }

  async shutdown(): Promise<void> {
    if (globalBrowser) {
      await globalBrowser.close();
      globalBrowser = undefined;
    }
  }
}

export class BrowserCrawlerProvider implements PluginProvider<CrawlerClient> {
  private client: CrawlerClient | null = null;

  async getClient(): Promise<CrawlerClient | null> {
    if (!this.client) {
      // Only create client if browser is configured
      if (!serverConfig.crawler.browserWebSocketUrl && !serverConfig.crawler.browserWebUrl) {
        return null;
      }
      const client = new BrowserCrawlerClient();
      await client.initialize?.();
      this.client = client;
    }
    return this.client;
  }

  static isConfigured(): boolean {
    return !!(serverConfig.crawler.browserWebSocketUrl || serverConfig.crawler.browserWebUrl);
  }
}
