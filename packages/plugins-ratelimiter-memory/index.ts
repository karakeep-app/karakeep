// Auto-register the in-memory rate limiter provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { MemoryRateLimiterProvider } from "./src";

PluginManager.register({
  type: PluginType.RateLimiter,
  name: "Memory",
  provider: new MemoryRateLimiterProvider(),
});
