import type { PluginProvider } from "@karakeep/shared/plugins";
import type {
  RateLimitDecision,
  RateLimiterClient,
  RateLimitOptions,
} from "@karakeep/shared/ratelimiter";

import { envConfig } from "./env";

class RedisRateLimiter implements RateLimiterClient {
  constructor(private readonly redis: any) {}

  async consume(
    key: string,
    opts: RateLimitOptions,
  ): Promise<RateLimitDecision> {
    const cost = opts.cost ?? 1;
    const now = Date.now();
    const ttlMs = opts.windowMs;

    // Using a fixed window algorithm: INCR the counter, set TTL on first hit
    const count = await this.redis.incrby(key, cost);
    if (count === cost) {
      // First hit, set the expiry for the window
      await this.redis.pexpire(key, ttlMs);
    }
    const pttl = await this.redis.pttl(key);

    const resetTime = pttl > 0 ? now + pttl : now + ttlMs;
    const allowed = count <= opts.max;
    return {
      allowed,
      remaining: Math.max(0, opts.max - count),
      resetTime,
      count,
    };
  }

  async shutdown(): Promise<void> {
    await this.redis.quit();
  }
}

export class RedisRateLimiterProvider
  implements PluginProvider<RateLimiterClient>
{
  private client: RateLimiterClient | null = null;
  private redis: any | null = null;

  static isConfigured(): boolean {
    return !!envConfig.REDIS_URL;
  }

  async getClient(): Promise<RateLimiterClient | null> {
    if (!RedisRateLimiterProvider.isConfigured()) {
      return null;
    }
    if (!this.client) {
      // Lazy import ioredis at runtime to avoid requiring it during typecheck in environments without deps installed
      const Redis = (await import("ioredis")).default as any;
      this.redis = new Redis(envConfig.REDIS_URL!);
      this.client = new RedisRateLimiter(this.redis);
    }
    return this.client;
  }
}
