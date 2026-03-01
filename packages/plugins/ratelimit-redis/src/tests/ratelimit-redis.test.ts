import assert from "assert";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import { RedisRateLimiter, RedisRateLimitProvider } from "../index";

describe("RedisRateLimiter", () => {
  let rateLimiter: RedisRateLimiter;

  beforeAll(async () => {
    const redisPort = inject("redisPort");
    const provider = new RedisRateLimitProvider({
      url: `redis://localhost:${redisPort}`,
    });
    const client = await provider.getClient();
    assert(client, "Failed to connect to Redis");
    rateLimiter = client as RedisRateLimiter;
  });

  beforeEach(async () => {
    await rateLimiter.clear();
  });

  afterAll(async () => {
    if (rateLimiter) {
      await rateLimiter.disconnect();
    }
  });

  describe("checkRateLimit", () => {
    it("should allow requests within rate limit", async () => {
      const config = {
        name: "test-allow",
        windowMs: 60000,
        maxRequests: 3,
      };

      const result1 = await rateLimiter.checkRateLimit(config, "user1");
      const result2 = await rateLimiter.checkRateLimit(config, "user1");
      const result3 = await rateLimiter.checkRateLimit(config, "user1");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(true);
    });

    it("should block requests exceeding rate limit", async () => {
      const config = {
        name: "test-block",
        windowMs: 60000,
        maxRequests: 2,
      };

      const result1 = await rateLimiter.checkRateLimit(config, "user1");
      const result2 = await rateLimiter.checkRateLimit(config, "user1");
      const result3 = await rateLimiter.checkRateLimit(config, "user1");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(false);
      assert(!result3.allowed);
      expect(result3.resetInSeconds).toBeGreaterThan(0);
    });

    it("should reset after window expires", async () => {
      const config = {
        name: "test-window",
        windowMs: 2000, // 2 second window for faster test
        maxRequests: 1,
      };

      const result1 = await rateLimiter.checkRateLimit(config, "user1");
      expect(result1.allowed).toBe(true);

      const result2 = await rateLimiter.checkRateLimit(config, "user1");
      expect(result2.allowed).toBe(false);

      // Wait for the window to expire
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const result3 = await rateLimiter.checkRateLimit(config, "user1");
      expect(result3.allowed).toBe(true);
    });

    it("should isolate rate limits by key", async () => {
      const config = {
        name: "test-isolate-key",
        windowMs: 60000,
        maxRequests: 1,
      };

      const result1 = await rateLimiter.checkRateLimit(config, "user1:/api/v1");
      const result2 = await rateLimiter.checkRateLimit(config, "user1:/api/v2");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it("should isolate rate limits by config name", async () => {
      const config1 = {
        name: "api-isolate",
        windowMs: 60000,
        maxRequests: 1,
      };
      const config2 = {
        name: "auth-isolate",
        windowMs: 60000,
        maxRequests: 1,
      };

      const result1 = await rateLimiter.checkRateLimit(config1, "user1");
      const result2 = await rateLimiter.checkRateLimit(config2, "user1");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it("should calculate correct resetInSeconds", async () => {
      const config = {
        name: "test-reset-calc",
        windowMs: 60000,
        maxRequests: 1,
      };

      await rateLimiter.checkRateLimit(config, "user1");
      const result = await rateLimiter.checkRateLimit(config, "user1");

      expect(result.allowed).toBe(false);
      assert(!result.allowed);
      expect(result.resetInSeconds).toBeGreaterThan(0);
      expect(result.resetInSeconds).toBeLessThanOrEqual(60);
    });

    it("should allow empty key", async () => {
      const config = {
        name: "test-empty-key",
        windowMs: 60000,
        maxRequests: 1,
      };

      const result = await rateLimiter.checkRateLimit(config, "");
      expect(result.allowed).toBe(true);
    });
  });

  describe("reset", () => {
    it("should reset rate limit for specific identifier", async () => {
      const config = {
        name: "test-reset",
        windowMs: 60000,
        maxRequests: 1,
      };

      await rateLimiter.checkRateLimit(config, "user1");
      const result1 = await rateLimiter.checkRateLimit(config, "user1");
      expect(result1.allowed).toBe(false);

      await rateLimiter.reset(config, "user1");

      const result2 = await rateLimiter.checkRateLimit(config, "user1");
      expect(result2.allowed).toBe(true);
    });

    it("should not affect other identifiers", async () => {
      const config = {
        name: "test-reset-isolation",
        windowMs: 60000,
        maxRequests: 1,
      };

      await rateLimiter.checkRateLimit(config, "user1");
      await rateLimiter.checkRateLimit(config, "user2");

      await rateLimiter.reset(config, "user1");

      const result1 = await rateLimiter.checkRateLimit(config, "user1");
      const result2 = await rateLimiter.checkRateLimit(config, "user2");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(false);
    });
  });

  describe("concurrent access", () => {
    it("should handle concurrent requests atomically", async () => {
      const config = {
        name: "test-concurrent",
        windowMs: 60000,
        maxRequests: 5,
      };

      // Fire 10 requests concurrently
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          rateLimiter.checkRateLimit(config, "user1"),
        ),
      );

      const allowed = results.filter((r) => r.allowed).length;
      const blocked = results.filter((r) => !r.allowed).length;

      expect(allowed).toBe(5);
      expect(blocked).toBe(5);
    });
  });
});
