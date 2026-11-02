import { TRPCError } from "@trpc/server";

import type { RateLimitConfig } from "@karakeep/shared/ratelimiting";
import serverConfig from "@karakeep/shared/config";
import {
  getRateLimitClient,
  getRateLimitIdentity,
} from "@karakeep/shared/ratelimiting";

/**
 * Create a tRPC middleware for rate limiting
 * @param config Rate limit configuration
 * @returns tRPC middleware function
 */
export function createRateLimitMiddleware<T>(config: RateLimitConfig) {
  return async function rateLimitMiddleware(opts: {
    path: string;
    ctx: {
      req: { ip: string | null };
      user?: { id?: string | null } | null;
      auth?: { type: string } | null;
    };
    next: () => Promise<T>;
  }) {
    if (!serverConfig.rateLimiting.enabled) {
      return opts.next();
    }

    const identity = getRateLimitIdentity({
      userId: opts.ctx.user?.id,
      ip: opts.ctx.req.ip,
      internal: opts.ctx.auth?.type === "internal",
    });

    if (!identity) {
      return opts.next();
    }

    const client = await getRateLimitClient();

    if (!client) {
      // If no rate limit client is registered, allow the request
      return opts.next();
    }

    const key = `${identity}:${opts.path}`;
    const result = await client.checkRateLimit(config, key);

    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${result.resetInSeconds} seconds.`,
      });
    }

    return opts.next();
  };
}
