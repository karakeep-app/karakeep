import { PluginManager, PluginType } from "./plugins";

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

export async function getCrawlerClient(): Promise<CrawlerClient> {
  const client = await PluginManager.getClient(PluginType.Crawler);
  if (!client) {
    throw new Error("Failed to get crawler client");
  }
  return client;
}
