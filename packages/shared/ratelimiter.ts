import { PluginManager, PluginType } from "./plugins";

export interface RateLimitOptions {
  // Time window in milliseconds
  windowMs: number;
  // Maximum allowed requests within the window
  max: number;
  // Optional cost for this operation (defaults to 1)
  cost?: number;
}

export interface RateLimitDecision {
  // Whether the request is allowed
  allowed: boolean;
  // Remaining number of allowed requests in the current window
  remaining: number;
  // Epoch millis when the window resets
  resetTime: number;
  // Current count after this consume attempt
  count: number;
}

export interface RateLimiterClient {
  // Atomically consume capacity for a key. Returns decision details.
  consume(key: string, opts: RateLimitOptions): Promise<RateLimitDecision>;
  // Optional shutdown hook for cleanup
  shutdown?(): Promise<void>;
}

export async function getRateLimiterClient(): Promise<RateLimiterClient | null> {
  return PluginManager.getClient(PluginType.RateLimiter);
}
