// Auto-register the RateLimit plugin when this package is imported
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { RateLimitProvider } from "./src";

PluginManager.register({
  type: PluginType.RateLimit,
  name: "In-Memory Rate Limiter",
  provider: new RateLimitProvider(),
});

// Export the provider and rate limiter class for advanced usage
export { RateLimiter, RateLimitProvider } from "./src";
