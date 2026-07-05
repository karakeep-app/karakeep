// Manages the shared browser environment used by the crawler: the global
// browser connection (and its reconnect-on-disconnect loop), the adblocker,
// the cookie jar loaded from disk, and the tracking/reaping of browser
// contexts so leaked ones eventually get closed.
import * as dns from "dns";
import { promises as fs } from "fs";
import * as path from "node:path";
import * as os from "os";
import { PlaywrightBlocker } from "@ghostery/adblocker-playwright";
import { Mutex } from "async-mutex";
import { exitAbortController } from "exit";
import { fetchWithProxy } from "network";
import type { RunProxyConfig } from "network";
import { Browser, BrowserContext, BrowserContextOptions } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { raceWith, timeoutRace } from "utils";
import { z } from "zod";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { setUrlHostnameFromResolvedAddress } from "@karakeep/shared/utils/url";
import { tryCatch } from "@karakeep/shared/tryCatch";

import { redactUrlCredentials } from "./utils";

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

export const CONTEXT_CLOSE_TIMEOUT_MS = 10_000;
export const PAGE_CLOSE_TIMEOUT_MS = 5_000;

export function getGlobalBrowser(): Browser | undefined {
  return globalBrowser;
}

export function getGlobalBlocker(): PlaywrightBlocker | undefined {
  return globalBlocker;
}

export function getGlobalCookies(): Cookie[] {
  return globalCookies;
}

export function trackContext(jobId: string, context: BrowserContext): void {
  activeContexts.set(jobId, { context, createdAt: Date.now() });
}

export function untrackContext(jobId: string): void {
  activeContexts.delete(jobId);
}

export function getPlaywrightProxyConfig(
  runProxy: RunProxyConfig,
): BrowserContextOptions["proxy"] {
  const proxyUrl = runProxy.httpsProxy || runProxy.httpProxy;
  if (!proxyUrl) {
    return undefined;
  }

  const parsed = new URL(proxyUrl);

  return {
    server: proxyUrl,
    username: parsed.username,
    password: parsed.password,
    bypass: runProxy.noProxy?.join(","),
  };
}

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
          void raceWith<boolean>(
            entry.context
              .close()
              .then(() => true)
              .catch((e: unknown) => {
                logger.warn(
                  `[Crawler] Failed to close stale context for job ${id}: ${e}`,
                );
                return true;
              }),
            timeoutRace<boolean>(CONTEXT_CLOSE_TIMEOUT_MS, () => false),
          ).then((contextClosed) => {
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

export async function startBrowserInstance() {
  if (serverConfig.crawler.browserWebSocketUrl) {
    logger.info(
      `[Crawler] Connecting to existing browser websocket address: ${redactUrlCredentials(serverConfig.crawler.browserWebSocketUrl)}`,
    );
    return await chromium.connect(serverConfig.crawler.browserWebSocketUrl, {
      timeout: 5000,
    });
  } else if (serverConfig.crawler.browserWebUrl) {
    logger.info(
      `[Crawler] Connecting to existing browser instance: ${redactUrlCredentials(serverConfig.crawler.browserWebUrl)}`,
    );

    const webUrl = new URL(serverConfig.crawler.browserWebUrl);
    const { address } = await dns.promises.lookup(webUrl.hostname);
    setUrlHostnameFromResolvedAddress(webUrl, address);
    logger.info(
      `[Crawler] Successfully resolved IP address, new address: ${redactUrlCredentials(webUrl.toString())}`,
    );

    return await chromium.connectOverCDP(webUrl.toString(), {
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

async function loadAdblocker(): Promise<void> {
  if (!serverConfig.crawler.enableAdblocker) {
    return;
  }
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
      logger.error("[Crawler] Invalid cookie file format:", error.issues);
    } else {
      logger.error("[Crawler] Failed to read or parse cookies file:", error);
    }
    throw error;
  }
}

/**
 * One-time setup of the crawler's browser environment: stealth plugin,
 * adblocker, the shared browser connection (unless connecting on demand),
 * cookies, and the stale-context reaper.
 */
export async function initializeBrowserEnvironment(): Promise<void> {
  chromium.use(StealthPlugin());
  await loadAdblocker();
  if (!serverConfig.crawler.browserConnectOnDemand) {
    await launchBrowser();
  } else {
    logger.info(
      "[Crawler] Browser connect on demand is enabled, won't proactively start the browser instance",
    );
  }
  await loadCookiesFromFile();
  startContextReaper();
}
