import type {
  RateLimitClient,
  RateLimitConfig,
  RateLimitResult,
} from "@karakeep/shared/ratelimiting";
import serverConfig from "@karakeep/shared/config";
import { PluginProvider } from "@karakeep/shared/plugins";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter implements RateLimitClient {
  private store = new Map<string, RateLimitEntry>();

  constructor() {
    // Cleanup expired entries every minute
    setInterval(() => this.cleanupExpiredEntries(), 60000);
  }

  private cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  checkRateLimit(
    config: RateLimitConfig,
    identifier: string,
    path?: string,
  ): RateLimitResult {
    if (!serverConfig.rateLimiting.enabled) {
      return { allowed: true };
    }

    if (!identifier) {
      return { allowed: true };
    }

    const key = path
      ? `${config.name}:${identifier}:${path}`
      : `${config.name}:${identifier}`;
    const now = Date.now();

    let entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      this.store.set(key, entry);
      return { allowed: true };
    }

    if (entry.count >= config.maxRequests) {
      const resetInSeconds = Math.ceil((entry.resetTime - now) / 1000);
      return {
        allowed: false,
        resetInSeconds,
      };
    }

    entry.count++;
    return { allowed: true };
  }

  reset(config: RateLimitConfig, identifier: string, path?: string) {
    const key = path
      ? `${config.name}:${identifier}:${path}`
      : `${config.name}:${identifier}`;
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

export class RateLimitProvider implements PluginProvider<RateLimitClient> {
  private client: RateLimiter | null = null;

  async getClient(): Promise<RateLimitClient | null> {
    if (!this.client) {
      this.client = new RateLimiter();
    }
    return this.client;
  }
}
