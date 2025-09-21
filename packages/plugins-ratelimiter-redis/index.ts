// Auto-register the Redis rate limiter provider when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { RedisRateLimiterProvider } from "./src";

if (RedisRateLimiterProvider.isConfigured()) {
  PluginManager.register({
    type: PluginType.RateLimiter,
    name: "Redis",
    provider: new RedisRateLimiterProvider(),
  });
}
