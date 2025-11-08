// Auto-register the Liteque queue provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { LitequeQueueProvider } from "./src";

PluginManager.register({
  type: PluginType.Queue,
  name: "Liteque",
  provider: new LitequeQueueProvider(),
});
