// Auto-register the Fetch Crawler provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { FetchCrawlerProvider } from "./src";

// Always register fetch crawler as fallback
PluginManager.register({
  type: PluginType.Crawler,
  name: "Fetch",
  provider: new FetchCrawlerProvider(),
});
