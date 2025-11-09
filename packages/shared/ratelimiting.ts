import { PluginManager, PluginType } from "./plugins";

export interface RateLimitConfig {
  name: string;
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  resetInSeconds?: number;
}

export interface RateLimitClient {
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
  ): RateLimitResult;

  /**
   * Reset rate limit for a specific identifier
   * @param config Rate limit configuration
   * @param identifier Unique identifier for the rate limit
   * @param path Optional path
   */
  reset(config: RateLimitConfig, identifier: string, path?: string): void;

  /**
   * Clear all rate limit entries
   */
  clear(): void;
}

export async function getRateLimitClient(): Promise<RateLimitClient | null> {
  return PluginManager.getClient(PluginType.RateLimit);
}
