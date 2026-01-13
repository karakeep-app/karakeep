import { LRUCache } from "lru-cache";

import type {
  RateLimitClient,
  RateLimitConfig,
  RateLimitResult,
} from "@karakeep/shared/ratelimiting";
import { PluginProvider } from "@karakeep/shared/plugins";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const DEFAULT_MAX_SIZE = 50_000;

export class RateLimiter implements RateLimitClient {
  private store: LRUCache<string, RateLimitEntry>;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.store = new LRUCache<string, RateLimitEntry>({
      max: maxSize,
    });
  }

  checkRateLimit(config: RateLimitConfig, key: string): RateLimitResult {
    if (!key) {
      return { allowed: true };
    }

    const rateLimitKey = `${config.name}:${key}`;
    const now = Date.now();

    let entry = this.store.get(rateLimitKey);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      this.store.set(rateLimitKey, entry);
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

  reset(config: RateLimitConfig, key: string) {
    const rateLimitKey = `${config.name}:${key}`;
    this.store.delete(rateLimitKey);
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
