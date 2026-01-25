// Auto-register the RateLimit plugin when this package is imported
import serverConfig from "@karakeep/shared/config";
import { PluginManager, PluginType } from "@karakeep/shared/plugins";

import { RedisRateLimitProvider } from "./src";

// Only register if Redis configuration is provided
if (serverConfig.redis?.url || serverConfig.redis?.host) {
  PluginManager.register({
    type: PluginType.RateLimit,
    name: "Redis Rate Limiter",
    provider: new RedisRateLimitProvider({
      url: serverConfig.redis.url,
      host: serverConfig.redis.host,
      port: serverConfig.redis.port,
      password: serverConfig.redis.password,
      db: serverConfig.redis.db,
      tls: serverConfig.redis.tls,
    }),
  });
}

// Export the provider and rate limiter class for advanced usage
export { RedisRateLimiter, RedisRateLimitProvider } from "./src";
