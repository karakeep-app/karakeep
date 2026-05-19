import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "@karakeep/trpc";
import type {
  RateLimitClient,
  RateLimitConfig,
} from "@karakeep/shared/ratelimiting";

const { getRateLimitClientMock } = vi.hoisted(() => ({
  getRateLimitClientMock: vi.fn(),
}));

vi.mock("@karakeep/shared/config", () => ({
  default: {
    rateLimiting: {
      enabled: true,
    },
  },
}));

vi.mock("@karakeep/shared/ratelimiting", () => ({
  getRateLimitClient: getRateLimitClientMock,
}));

import { createRateLimitMiddleware } from "./rateLimit";

describe("createRateLimitMiddleware", () => {
  const config: RateLimitConfig = {
    name: "assets.upload",
    windowMs: 60_000,
    maxRequests: 10,
  };

  const client: RateLimitClient = {
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    reset: vi.fn(),
    clear: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getRateLimitClientMock.mockResolvedValue(client);
  });

  function buildApp(ctx: Context) {
    return new Hono<{
      Variables: {
        ctx: Context;
      };
    }>()
      .use(async (c, next) => {
        c.set("ctx", ctx);
        await next();
      })
      .use(createRateLimitMiddleware(config))
      .get("/", (c) => c.text("ok"));
  }

  it("includes the authed user id in the rate limit key", async () => {
    const response = await buildApp({
      user: {
        id: "user-123",
        email: "user@example.com",
        role: "user",
      },
      db: {} as never,
      req: { ip: "127.0.0.1" },
    }).request("http://localhost/");

    expect(response.status).toBe(200);
    expect(client.checkRateLimit).toHaveBeenCalledWith(
      config,
      "127.0.0.1:user:user-123:assets.upload",
    );
  });

  it("keeps the existing ip-based key for unauthed requests", async () => {
    await buildApp({
      user: null,
      db: {} as never,
      req: { ip: "127.0.0.1" },
    }).request("http://localhost/");

    expect(client.checkRateLimit).toHaveBeenCalledWith(
      config,
      "127.0.0.1:assets.upload",
    );
  });
});
