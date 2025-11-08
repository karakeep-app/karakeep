// Auto-register the Smart Crawler provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { SmartCrawlerProvider } from "./src";

// Always register the smart crawler
PluginManager.register({
  type: PluginType.Crawler,
  name: "Smart",
  provider: new SmartCrawlerProvider(),
});
