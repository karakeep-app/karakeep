// Auto-register the Restate queue provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { RestateQueueProvider } from "./src";

if (RestateQueueProvider.isConfigured()) {
  PluginManager.register({
    type: PluginType.Queue,
    name: "Restate",
    provider: new RestateQueueProvider(),
  });
}
