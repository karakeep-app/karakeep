// Auto-register the DB search provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import { DBSearchProvider } from "./src";

if (DBSearchProvider.isConfigured()) {
  PluginManager.register({
    type: PluginType.Search,
    name: "DBSearch",
    provider: new DBSearchProvider(),
  });
}

export { DBSearchProvider, DBSearchIndexClient } from "./src";
