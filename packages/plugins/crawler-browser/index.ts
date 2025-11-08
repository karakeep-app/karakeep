// Auto-register the Browser Crawler provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { BrowserCrawlerProvider } from "./src";

// Only register if browser crawling is configured
if (BrowserCrawlerProvider.isConfigured()) {
  PluginManager.register({
    type: PluginType.Crawler,
    name: "Browser",
    provider: new BrowserCrawlerProvider(),
  });
}
