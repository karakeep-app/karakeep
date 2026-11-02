import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import type { RateLimitConfig } from "@karakeep/shared/ratelimiting";
import serverConfig from "@karakeep/shared/config";
import {
  getRateLimitClient,
  getRateLimitIdentity,
} from "@karakeep/shared/ratelimiting";
import { Context } from "@karakeep/trpc";

export function createRateLimitMiddleware(config: RateLimitConfig) {
  return createMiddleware<{
    Variables: {
      ctx: Context;
    };
  }>(async (c, next) => {
    if (!serverConfig.rateLimiting.enabled) {
      return next();
    }

    const identity = getRateLimitIdentity({
      userId: c.var.ctx.user?.id,
      ip: c.var.ctx.req.ip,
      internal: c.var.ctx.auth?.type === "internal",
    });
    if (!identity) {
      return next();
    }

    const client = await getRateLimitClient();
    if (!client) {
      return next();
    }

    const key = `${identity}:${config.name}`;
    const result = await client.checkRateLimit(config, key);

    if (!result.allowed) {
      throw new HTTPException(429, {
        message: `Rate limit exceeded. Try again in ${result.resetInSeconds} seconds.`,
      });
    }

    return next();
  });
}
