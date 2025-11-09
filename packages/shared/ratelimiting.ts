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
  checkRateLimit(config: RateLimitConfig, key: string): RateLimitResult;

  /**
   * Reset rate limit for a specific key
   * @param config Rate limit configuration
   * @param key Unique rate limiting key
   */
  reset(config: RateLimitConfig, key: string): void;

  /**
   * Clear all rate limit entries
   */
  clear(): void;
}

export async function getRateLimitClient(): Promise<RateLimitClient | null> {
  return PluginManager.getClient(PluginType.RateLimit);
}
