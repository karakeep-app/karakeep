import serverConfig from "@karakeep/shared/config";

export interface RateLimitConfig {
  name: string;
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimitResult {
  allowed: boolean;
  resetInSeconds?: number;
}

export class RateLimiter {
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

  /**
   * Check if a request should be allowed based on rate limiting rules
   * @param config Rate limit configuration
   * @param identifier Unique identifier for the rate limit (e.g., IP address, user ID)
   * @param path Optional path to include in the rate limit key
   * @returns Result indicating if the request is allowed and reset time if not
   */
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

  /**
   * Reset rate limit for a specific identifier
   * @param config Rate limit configuration
   * @param identifier Unique identifier for the rate limit
   * @param path Optional path
   */
  reset(config: RateLimitConfig, identifier: string, path?: string) {
    const key = path
      ? `${config.name}:${identifier}:${path}`
      : `${config.name}:${identifier}`;
    this.store.delete(key);
  }

  /**
   * Clear all rate limit entries
   */
  clear() {
    this.store.clear();
  }
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter();
