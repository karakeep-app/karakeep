import { TRPCError } from "@trpc/server";

import type { RateLimitConfig } from "@karakeep/shared/ratelimiting";
import serverConfig from "@karakeep/shared/config";
import { getRateLimitClient } from "@karakeep/shared/ratelimiting";

/**
 * Create a tRPC middleware for rate limiting
 * @param config Rate limit configuration
 * @returns tRPC middleware function
 */
export function createRateLimitMiddleware<T>(config: RateLimitConfig) {
  return async function rateLimitMiddleware(opts: {
    path: string;
    ctx: { req: { ip: string | null } };
    next: () => Promise<T>;
  }) {
    if (!serverConfig.rateLimiting.enabled) {
      return opts.next();
    }

    const ip = opts.ctx.req.ip;

    if (!ip) {
      return opts.next();
    }

    const client = await getRateLimitClient();

    if (!client) {
      // If no rate limit client is registered, allow the request
      return opts.next();
    }

    // Build the rate limiting key from IP and path
    const key = `${ip}:${opts.path}`;
    const result = client.checkRateLimit(config, key);

    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${result.resetInSeconds} seconds.`,
      });
    }

    return opts.next();
  };
}
