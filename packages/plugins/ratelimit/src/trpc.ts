import { TRPCError } from "@trpc/server";

import type { RateLimitConfig } from "./index";
import { globalRateLimiter } from "./index";

/**
 * Create a tRPC middleware for rate limiting
 * @param config Rate limit configuration
 * @returns tRPC middleware function
 */
export function createRateLimitMiddleware<T>(config: RateLimitConfig) {
  return function rateLimitMiddleware(opts: {
    path: string;
    ctx: { req: { ip: string | null } };
    next: () => Promise<T>;
  }) {
    const ip = opts.ctx.req.ip;

    if (!ip) {
      return opts.next();
    }

    const result = globalRateLimiter.checkRateLimit(config, ip, opts.path);

    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${result.resetInSeconds} seconds.`,
      });
    }

    return opts.next();
  };
}
