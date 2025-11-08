import { eq } from "drizzle-orm";

import { PluginManager, PluginType } from "./plugins";
import logger from "./logger";
import serverConfig from "./config";

export interface CrawlOptions {
  /**
   * User ID for determining user-specific settings (e.g., browserCrawlingEnabled)
   */
  userId: string;

  /**
   * Job ID for logging and tracking
   */
  jobId: string;

  /**
   * AbortSignal for cancelling the crawl operation
   */
  abortSignal: AbortSignal;

  /**
   * Force browserless mode even if browser crawling is enabled
   */
  forceBrowserless?: boolean;

  /**
   * Timeout in milliseconds for the crawl operation
   */
  timeout?: number;
}

export interface CrawlResult {
  /**
   * The HTML content of the page
   */
  htmlContent: string;

  /**
   * Screenshot of the page (if available)
   * JPEG format as a Buffer
   */
  screenshot: Buffer | undefined;

  /**
   * HTTP status code of the response
   */
  statusCode: number;

  /**
   * Final URL after any redirects
   */
  url: string;
}

export interface CrawlerClient {
  /**
   * Crawl a URL and return the HTML content and screenshot
   */
  crawl(url: string, options: CrawlOptions): Promise<CrawlResult>;

  /**
   * Initialize the crawler (e.g., start browser instance)
   */
  initialize?(): Promise<void>;

  /**
   * Cleanup resources (e.g., close browser)
   */
  shutdown?(): Promise<void>;
}

/**
 * Get the appropriate crawler client based on configuration and user settings.
 * This function contains the logic to decide between browser and fetch crawlers.
 */
export async function getCrawlerClient(options: {
  userId: string;
  jobId: string;
  forceBrowserless?: boolean;
}): Promise<CrawlerClient> {
  const { userId, jobId, forceBrowserless } = options;

  // Import db and users here to avoid circular dependencies
  const { db } = await import("@karakeep/db");
  const { users } = await import("@karakeep/db/schema");

  // If forceBrowserless is set, use fetch crawler
  if (forceBrowserless) {
    logger.info(
      `[Crawler][${jobId}] forceBrowserless option is set, using fetch crawler`,
    );
    return getFetchCrawler();
  }

  // Check if browser is configured
  const isBrowserConfigured =
    !!(serverConfig.crawler.browserWebSocketUrl || serverConfig.crawler.browserWebUrl);

  if (!isBrowserConfigured) {
    logger.info(
      `[Crawler][${jobId}] Browser not configured, using fetch crawler`,
    );
    return getFetchCrawler();
  }

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

  // If user explicitly disabled browser crawling, use fetch
  if (browserCrawlingEnabled !== null && !browserCrawlingEnabled) {
    logger.info(
      `[Crawler][${jobId}] User has disabled browser crawling, using fetch crawler`,
    );
    return getFetchCrawler();
  }

  // Use browser crawler
  logger.info(
    `[Crawler][${jobId}] Using browser crawler`,
  );
  return getBrowserCrawler();
}

/**
 * Get the fetch crawler plugin
 */
async function getFetchCrawler(): Promise<CrawlerClient> {
  // Get all registered crawler plugins
  const plugins = PluginManager["providers"][PluginType.Crawler];
  if (!plugins || plugins.length === 0) {
    throw new Error("No crawler plugins registered");
  }

  // Find the fetch crawler
  const fetchPlugin = plugins.find((p) => p.name === "Fetch");
  if (!fetchPlugin) {
    throw new Error("Fetch crawler plugin not found");
  }

  const client = await fetchPlugin.provider.getClient();
  if (!client) {
    throw new Error("Failed to get fetch crawler client");
  }
  return client;
}

/**
 * Get the browser crawler plugin
 */
async function getBrowserCrawler(): Promise<CrawlerClient> {
  // Get all registered crawler plugins
  const plugins = PluginManager["providers"][PluginType.Crawler];
  if (!plugins || plugins.length === 0) {
    throw new Error("No crawler plugins registered");
  }

  // Find the browser crawler
  const browserPlugin = plugins.find((p) => p.name === "Browser");
  if (!browserPlugin) {
    // Fall back to fetch if browser not available
    logger.warn("Browser crawler plugin not found, falling back to fetch crawler");
    return getFetchCrawler();
  }

  const client = await browserPlugin.provider.getClient();
  if (!client) {
    throw new Error("Failed to get browser crawler client");
  }
  return client;
}
