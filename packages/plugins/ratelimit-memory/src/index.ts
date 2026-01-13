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
const DEFAULT_CLEANUP_INTERVAL_CALLS = 1000;

export class RateLimiter implements RateLimitClient {
  private store = new Map<string, RateLimitEntry>();
  private callsSinceCleanup = 0;
  private readonly maxSize: number;
  private readonly cleanupIntervalCalls: number;

  constructor(
    maxSize = DEFAULT_MAX_SIZE,
    cleanupIntervalCalls = DEFAULT_CLEANUP_INTERVAL_CALLS,
  ) {
    this.maxSize = maxSize;
    this.cleanupIntervalCalls = cleanupIntervalCalls;
  }

  private cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  private evictOldestEntries(count: number) {
    const iterator = this.store.keys();
    for (let i = 0; i < count; i++) {
      const result = iterator.next();
      if (result.done) break;
      this.store.delete(result.value);
    }
  }

  checkRateLimit(config: RateLimitConfig, key: string): RateLimitResult {
    if (!key) {
      return { allowed: true };
    }

    this.callsSinceCleanup++;
    if (this.callsSinceCleanup >= this.cleanupIntervalCalls) {
      this.cleanupExpiredEntries();
      this.callsSinceCleanup = 0;
    }

    const rateLimitKey = `${config.name}:${key}`;
    const now = Date.now();

    let entry = this.store.get(rateLimitKey);

    if (!entry || now > entry.resetTime) {
      if (this.store.size >= this.maxSize) {
        this.cleanupExpiredEntries();
        if (this.store.size >= this.maxSize) {
          this.evictOldestEntries(Math.ceil(this.maxSize * 0.1));
        }
      }

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
