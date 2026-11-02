import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { createRateLimitMiddleware } from "../rateLimit";

describe("createRateLimitMiddleware", () => {
  const config: RateLimitConfig = {
    name: "globalAuthed",
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

  it("keys authed requests by user id instead of ip", async () => {
    const next = vi.fn().mockResolvedValue("ok");
    const middleware = createRateLimitMiddleware(config);

    const result = await middleware({
      path: "bookmarks.create",
      ctx: {
        req: { ip: "127.0.0.1" },
        user: { id: "user-123" },
      },
      next,
    });

    expect(result).toBe("ok");
    expect(client.checkRateLimit).toHaveBeenCalledWith(
      config,
      "user:user-123:bookmarks.create",
    );
  });

  it("keys unauthed requests by ip", async () => {
    const next = vi.fn().mockResolvedValue("ok");
    const middleware = createRateLimitMiddleware(config);

    await middleware({
      path: "users.create",
      ctx: {
        req: { ip: "127.0.0.1" },
        user: null,
      },
      next,
    });

    expect(client.checkRateLimit).toHaveBeenCalledWith(
      config,
      "ip:127.0.0.1:users.create",
    );
  });

  it("rate limits authed requests even without an ip", async () => {
    const next = vi.fn().mockResolvedValue("ok");
    const middleware = createRateLimitMiddleware(config);

    await middleware({
      path: "bookmarks.create",
      ctx: {
        req: { ip: null },
        user: { id: "user-123" },
      },
      next,
    });

    expect(client.checkRateLimit).toHaveBeenCalledWith(
      config,
      "user:user-123:bookmarks.create",
    );
  });

  it("skips rate limiting when there's neither a user nor an ip", async () => {
    const next = vi.fn().mockResolvedValue("ok");
    const middleware = createRateLimitMiddleware(config);

    const result = await middleware({
      path: "users.create",
      ctx: {
        req: { ip: null },
        user: null,
      },
      next,
    });

    expect(result).toBe("ok");
    expect(client.checkRateLimit).not.toHaveBeenCalled();
  });

  it("rejects requests over the limit", async () => {
    vi.mocked(client.checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      resetInSeconds: 30,
    });
    const next = vi.fn().mockResolvedValue("ok");
    const middleware = createRateLimitMiddleware(config);

    await expect(
      middleware({
        path: "bookmarks.create",
        ctx: {
          req: { ip: "127.0.0.1" },
          user: { id: "user-123" },
        },
        next,
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(next).not.toHaveBeenCalled();
  });

  it("skips rate limiting for internal (impersonated) calls", async () => {
    const next = vi.fn().mockResolvedValue("ok");
    const middleware = createRateLimitMiddleware(config);

    const result = await middleware({
      path: "bookmarks.createBookmark",
      ctx: {
        req: { ip: null },
        user: { id: "user-123" },
        auth: { type: "internal" },
      },
      next,
    });

    expect(result).toBe("ok");
    expect(client.checkRateLimit).not.toHaveBeenCalled();
  });
});
