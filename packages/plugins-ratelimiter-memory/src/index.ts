import type { PluginProvider } from "@karakeep/shared/plugins";
import type {
  RateLimitDecision,
  RateLimiterClient,
  RateLimitOptions,
} from "@karakeep/shared/ratelimiter";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class MemoryRateLimiter implements RateLimiterClient {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Periodically cleanup expired entries to avoid unbounded memory growth
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredEntries(),
      60_000,
    );
    // Don't keep process alive because of the timer (Node only)
    (this.cleanupInterval as any).unref?.();
  }

  async consume(
    key: string,
    opts: RateLimitOptions,
  ): Promise<RateLimitDecision> {
    const now = Date.now();
    const cost = opts.cost ?? 1;

    let entry = this.store.get(key);
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + opts.windowMs,
      };
    }

    entry.count += cost;
    this.store.set(key, entry);

    const allowed = entry.count <= opts.max;
    return {
      allowed,
      remaining: Math.max(0, opts.max - entry.count),
      resetTime: entry.resetTime,
      count: entry.count,
    };
  }

  private cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.cleanupInterval);
  }
}

export class MemoryRateLimiterProvider
  implements PluginProvider<RateLimiterClient>
{
  private client: RateLimiterClient | null = null;

  async getClient(): Promise<RateLimiterClient | null> {
    if (!this.client) {
      this.client = new MemoryRateLimiter();
    }
    return this.client;
  }
}
