import type { PluginProvider } from "@karakeep/shared/plugins";
import type { CrawlerClient, CrawlOptions, CrawlResult } from "@karakeep/shared/crawler";
import logger from "@karakeep/shared/logger";
import { fetchWithProxy } from "@karakeep/shared-server";

export class FetchCrawlerClient implements CrawlerClient {
  async crawl(url: string, options: CrawlOptions): Promise<CrawlResult> {
    const { jobId, abortSignal, timeout = 5000 } = options;

    logger.info(
      `[Crawler][Fetch][${jobId}] Running in browserless mode. Will do a plain http request to "${url}". Screenshots will be disabled.`,
    );
    const response = await fetchWithProxy(url, {
      signal: AbortSignal.any([AbortSignal.timeout(timeout), abortSignal]),
    });
    logger.info(
      `[Crawler][Fetch][${jobId}] Successfully fetched the content of "${url}". Status: ${response.status}, Size: ${response.size}`,
    );
    return {
      htmlContent: await response.text(),
      statusCode: response.status,
      screenshot: undefined,
      url: response.url,
    };
  }
}

export class FetchCrawlerProvider implements PluginProvider<CrawlerClient> {
  private client: CrawlerClient | null = null;

  async getClient(): Promise<CrawlerClient | null> {
    if (!this.client) {
      this.client = new FetchCrawlerClient();
    }
    return this.client;
  }
}
