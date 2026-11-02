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

vi.mock("@karakeep/shared/ratelimiting", async (original) => ({
  ...(await original<typeof import("@karakeep/shared/ratelimiting")>()),
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

  it("keys authed requests by user id instead of ip", async () => {
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
      "user:user-123:assets.upload",
    );
  });

  it("keys unauthed requests by ip", async () => {
    await buildApp({
      user: null,
      db: {} as never,
      req: { ip: "127.0.0.1" },
    }).request("http://localhost/");

    expect(client.checkRateLimit).toHaveBeenCalledWith(
      config,
      "ip:127.0.0.1:assets.upload",
    );
  });

  it("rate limits authed requests even without an ip", async () => {
    await buildApp({
      user: {
        id: "user-123",
        email: "user@example.com",
        role: "user",
      },
      db: {} as never,
      req: { ip: null },
    }).request("http://localhost/");

    expect(client.checkRateLimit).toHaveBeenCalledWith(
      config,
      "user:user-123:assets.upload",
    );
  });

  it("skips rate limiting when there's neither a user nor an ip", async () => {
    const response = await buildApp({
      user: null,
      db: {} as never,
      req: { ip: null },
    }).request("http://localhost/");

    expect(response.status).toBe(200);
    expect(client.checkRateLimit).not.toHaveBeenCalled();
  });

  it("skips rate limiting for internal (impersonated) calls", async () => {
    const response = await buildApp({
      user: {
        id: "user-123",
        email: "user@example.com",
        role: "user",
      },
      auth: { type: "internal" },
      db: {} as never,
      req: { ip: null },
    }).request("http://localhost/");

    expect(response.status).toBe(200);
    expect(client.checkRateLimit).not.toHaveBeenCalled();
  });
});
