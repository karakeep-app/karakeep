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

vi.mock("@karakeep/shared/ratelimiting", () => ({
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

  it("includes the authed user id in the rate limit key", async () => {
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
      "127.0.0.1:user:user-123:bookmarks.create",
    );
  });

  it("keeps the existing ip-based key for unauthed requests", async () => {
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
      "127.0.0.1:users.create",
    );
  });
});
