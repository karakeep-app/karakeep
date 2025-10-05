import { TRPCError } from "@trpc/server";

import serverConfig from "@karakeep/shared/config";
import { getRateLimiterClient } from "@karakeep/shared/ratelimiter";

import { Context } from ".";

interface RateLimitConfig {
  name: string;
  windowMs: number;
  maxRequests: number;
}

export function createRateLimitMiddleware<T>(config: RateLimitConfig) {
  return async function rateLimitMiddleware(opts: {
    path: string;
    ctx: Context;
    next: () => Promise<T>;
  }) {
    if (!serverConfig.rateLimiting.enabled) {
      return opts.next();
    }

    const ip = opts.ctx.req.ip;
    if (!ip) {
      return opts.next();
    }

    // TODO: Better fingerprinting
    const key = `${config.name}:${ip}:${opts.path}`;

    const client = await getRateLimiterClient();
    if (!client) {
      // No rate limiter configured; allow request
      return opts.next();
    }

    const decision = await client.consume(key, {
      windowMs: config.windowMs,
      max: config.maxRequests,
    });

    if (!decision.allowed) {
      const resetInSeconds = Math.ceil(
        (decision.resetTime - Date.now()) / 1000,
      );
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${resetInSeconds} seconds.`,
      });
    }

    return opts.next();
  };
}
