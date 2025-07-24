import { TRPCError } from "@trpc/server";

import serverConfig from "@karakeep/shared/config";

import { Context } from ".";

interface RateLimitConfig {
  name: string;
  windowMs: number;
  maxRequests: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

setInterval(cleanupExpiredEntries, 60000);

export function createRateLimitMiddleware<T>(config: RateLimitConfig) {
  return function rateLimitMiddleware(opts: {
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
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      rateLimitStore.set(key, entry);
      return opts.next();
    }

    if (entry.count >= config.maxRequests) {
      const resetInSeconds = Math.ceil((entry.resetTime - now) / 1000);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${resetInSeconds} seconds.`,
      });
    }

    entry.count++;
    return opts.next();
  };
}
