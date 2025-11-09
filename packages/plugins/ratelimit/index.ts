// Generic rate limiter (framework-agnostic)
export {
  RateLimiter,
  globalRateLimiter,
  type RateLimitConfig,
  type RateLimitEntry,
  type RateLimitResult,
} from "./src";

// tRPC-specific adapter
export { createRateLimitMiddleware } from "./src/trpc";
