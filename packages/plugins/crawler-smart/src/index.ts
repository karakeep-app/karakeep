import { eq } from "drizzle-orm";

import type { PluginProvider } from "@karakeep/shared/plugins";
import type { CrawlerClient, CrawlOptions, CrawlResult } from "@karakeep/shared/crawler";
import { db } from "@karakeep/db";
import { users } from "@karakeep/db/schema";
import logger from "@karakeep/shared/logger";
import serverConfig from "@karakeep/shared/config";
import { BrowserCrawlerClient } from "../../crawler-browser/src";
import { FetchCrawlerClient } from "../../crawler-fetch/src";

/**
 * Smart crawler that decides whether to use browser or fetch-based crawling
 * based on user settings and configuration.
 */
export class SmartCrawlerClient implements CrawlerClient {
  private browserCrawler: BrowserCrawlerClient;
  private fetchCrawler: FetchCrawlerClient;
  private initialized = false;

  constructor() {
    this.browserCrawler = new BrowserCrawlerClient();
    this.fetchCrawler = new FetchCrawlerClient();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Only initialize browser crawler if browser is configured
    if (serverConfig.crawler.browserWebSocketUrl || serverConfig.crawler.browserWebUrl) {
      await this.browserCrawler.initialize?.();
    }

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    await this.browserCrawler.shutdown?.();
  }

  async crawl(url: string, options: CrawlOptions): Promise<CrawlResult> {
    const { userId, jobId, forceBrowserless } = options;

    // If forceBrowserless is set, use fetch crawler
    if (forceBrowserless) {
      logger.info(
        `[Crawler][Smart][${jobId}] forceBrowserless option is set, using fetch crawler`,
      );
      return this.fetchCrawler.crawl(url, options);
    }

    // Check if browser is configured
    const isBrowserConfigured =
      !!(serverConfig.crawler.browserWebSocketUrl || serverConfig.crawler.browserWebUrl);

    if (!isBrowserConfigured) {
      logger.info(
        `[Crawler][Smart][${jobId}] Browser not configured, using fetch crawler`,
      );
      return this.fetchCrawler.crawl(url, options);
    }

    // Check user's browser crawling setting
    const userData = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { browserCrawlingEnabled: true },
    });

    if (!userData) {
      logger.error(`[Crawler][Smart][${jobId}] User ${userId} not found`);
      throw new Error(`User ${userId} not found`);
    }

    const browserCrawlingEnabled = userData.browserCrawlingEnabled;

    // If user explicitly disabled browser crawling, use fetch
    if (browserCrawlingEnabled !== null && !browserCrawlingEnabled) {
      logger.info(
        `[Crawler][Smart][${jobId}] User has disabled browser crawling, using fetch crawler`,
      );
      return this.fetchCrawler.crawl(url, options);
    }

    // Use browser crawler
    logger.info(
      `[Crawler][Smart][${jobId}] Using browser crawler`,
    );
    return this.browserCrawler.crawl(url, options);
  }
}

export class SmartCrawlerProvider implements PluginProvider<CrawlerClient> {
  private client: CrawlerClient | null = null;

  async getClient(): Promise<CrawlerClient | null> {
    if (!this.client) {
      const client = new SmartCrawlerClient();
      await client.initialize?.();
      this.client = client;
    }
    return this.client;
  }
}
