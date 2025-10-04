// Auto-register the Liteque queue provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { RestateQueueProvider } from "./src";

PluginManager.register({
  type: PluginType.Queue,
  name: "Restate",
  provider: new RestateQueueProvider(),
});
