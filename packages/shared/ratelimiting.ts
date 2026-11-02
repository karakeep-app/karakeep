import { PluginManager, PluginType } from "./plugins";

export interface RateLimitConfig {
  name: string;
  windowMs: number;
  maxRequests: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; resetInSeconds: number };

export interface RateLimitClient {
  /**
   * Check if a request should be allowed based on rate limiting rules
   * @param config Rate limit configuration
   * @param key Unique rate limiting key (e.g., "ip:127.0.0.1:path:/api/v1")
   * @returns Result indicating if the request is allowed and reset time if not
   */
  checkRateLimit(
    config: RateLimitConfig,
    key: string,
  ): RateLimitResult | Promise<RateLimitResult>;

  /**
   * Reset rate limit for a specific key
   * @param config Rate limit configuration
   * @param key Unique rate limiting key
   */
  reset(config: RateLimitConfig, key: string): void | Promise<void>;

  /**
   * Clear all rate limit entries
   */
  clear(): void | Promise<void>;
}

export async function getRateLimitClient(): Promise<RateLimitClient | null> {
  return PluginManager.getClient(PluginType.RateLimit);
}

/**
 * Build the identity part of a rate limit key. Authenticated requests are
 * keyed by user id so that a user gets a single bucket regardless of the IP
 * they come from (client IPs are derived from spoofable headers). Anonymous
 * requests fall back to the client IP.
 * @returns The identity key, or null if the request shouldn't be rate limited
 * (internal server-initiated calls, or requests that can't be identified).
 */
export function getRateLimitIdentity(opts: {
  userId?: string | null;
  ip?: string | null;
  internal?: boolean;
}): string | null {
  if (opts.internal) {
    return null;
  }
  if (opts.userId) {
    return `user:${opts.userId}`;
  }
  if (opts.ip) {
    return `ip:${opts.ip}`;
  }
  return null;
}
