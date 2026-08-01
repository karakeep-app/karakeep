// Auto-register the MeiliSearch Vector provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { MeiliSearchVectorProvider } from "./src";

if (MeiliSearchVectorProvider.isConfigured()) {
  PluginManager.register({
    type: PluginType.VectorStore,
    name: "MeiliSearchVector",
    provider: new MeiliSearchVectorProvider(),
  });
}
