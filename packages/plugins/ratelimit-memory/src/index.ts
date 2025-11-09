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

export class RateLimiter implements RateLimitClient {
  private store = new Map<string, RateLimitEntry>();
  private cleanupProbability: number;

  constructor(cleanupProbability = 0.01) {
    // Probability of cleanup on each check (default 1%)
    this.cleanupProbability = cleanupProbability;
  }

  private cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  checkRateLimit(config: RateLimitConfig, key: string): RateLimitResult {
    if (!key) {
      return { allowed: true };
    }

    // Probabilistic cleanup
    if (Math.random() < this.cleanupProbability) {
      this.cleanupExpiredEntries();
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
