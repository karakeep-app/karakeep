import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimiter } from "./index";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rateLimiter.clear();
  });

  describe("checkRateLimit", () => {
    it("should allow requests within rate limit", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 3,
      };

      const result1 = rateLimiter.checkRateLimit(config, "user1");
      const result2 = rateLimiter.checkRateLimit(config, "user1");
      const result3 = rateLimiter.checkRateLimit(config, "user1");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(true);
    });

    it("should block requests exceeding rate limit", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 2,
      };

      const result1 = rateLimiter.checkRateLimit(config, "user1");
      const result2 = rateLimiter.checkRateLimit(config, "user1");
      const result3 = rateLimiter.checkRateLimit(config, "user1");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(false);
      assert(!result3.allowed);
      expect(result3.resetInSeconds).toBeGreaterThan(0);
    });

    it("should reset after window expires", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 2,
      };

      // First two requests allowed
      const result1 = rateLimiter.checkRateLimit(config, "user1");
      const result2 = rateLimiter.checkRateLimit(config, "user1");
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);

      // Third request blocked
      const result3 = rateLimiter.checkRateLimit(config, "user1");
      expect(result3.allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(61000);

      // Should allow request after window reset
      const result4 = rateLimiter.checkRateLimit(config, "user1");
      expect(result4.allowed).toBe(true);
    });

    it("should isolate rate limits by identifier", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 1,
      };

      const result1 = rateLimiter.checkRateLimit(config, "user1");
      const result2 = rateLimiter.checkRateLimit(config, "user2");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it("should isolate rate limits by key", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 1,
      };

      const result1 = rateLimiter.checkRateLimit(config, "user1:/api/v1");
      const result2 = rateLimiter.checkRateLimit(config, "user1:/api/v2");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it("should isolate rate limits by config name", () => {
      const config1 = {
        name: "api",
        windowMs: 60000,
        maxRequests: 1,
      };
      const config2 = {
        name: "auth",
        windowMs: 60000,
        maxRequests: 1,
      };

      const result1 = rateLimiter.checkRateLimit(config1, "user1");
      const result2 = rateLimiter.checkRateLimit(config2, "user1");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it("should calculate correct resetInSeconds", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 1,
      };

      // First request allowed
      rateLimiter.checkRateLimit(config, "user1");

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30000);

      // Second request blocked
      const result = rateLimiter.checkRateLimit(config, "user1");
      expect(result.allowed).toBe(false);
      // Should have ~30 seconds remaining
      assert(!result.allowed);
      expect(result.resetInSeconds).toBeGreaterThan(29);
      expect(result.resetInSeconds).toBeLessThanOrEqual(30);
    });
  });

  describe("reset", () => {
    it("should reset rate limit for specific identifier", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 1,
      };

      // Use up the limit
      rateLimiter.checkRateLimit(config, "user1");
      const result1 = rateLimiter.checkRateLimit(config, "user1");
      expect(result1.allowed).toBe(false);

      // Reset the limit
      rateLimiter.reset(config, "user1");

      // Should allow request again
      const result2 = rateLimiter.checkRateLimit(config, "user1");
      expect(result2.allowed).toBe(true);
    });

    it("should reset rate limit for specific key", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 1,
      };

      // Use up the limit for key1
      rateLimiter.checkRateLimit(config, "user1:/path1");
      const result1 = rateLimiter.checkRateLimit(config, "user1:/path1");
      expect(result1.allowed).toBe(false);

      // Reset only key1
      rateLimiter.reset(config, "user1:/path1");

      // key1 should be allowed
      const result2 = rateLimiter.checkRateLimit(config, "user1:/path1");
      expect(result2.allowed).toBe(true);
    });

    it("should not affect other identifiers", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 1,
      };

      // Use up limits for both users
      rateLimiter.checkRateLimit(config, "user1");
      rateLimiter.checkRateLimit(config, "user2");

      // Reset only user1
      rateLimiter.reset(config, "user1");

      const result1 = rateLimiter.checkRateLimit(config, "user1");
      const result2 = rateLimiter.checkRateLimit(config, "user2");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all rate limits", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 1,
      };

      // Use up limits for multiple users
      rateLimiter.checkRateLimit(config, "user1");
      rateLimiter.checkRateLimit(config, "user2");

      // Clear all limits
      rateLimiter.clear();

      // All should be allowed
      const result1 = rateLimiter.checkRateLimit(config, "user1");
      const result2 = rateLimiter.checkRateLimit(config, "user2");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe("cleanup", () => {
    it("should cleanup expired entries", () => {
      const config = {
        name: "test",
        windowMs: 60000,
        maxRequests: 1,
      };

      // Create an entry
      rateLimiter.checkRateLimit(config, "user1");

      // Advance time past window + cleanup interval
      vi.advanceTimersByTime(61000 + 60000);

      // Entry should be cleaned up and new request allowed
      const result = rateLimiter.checkRateLimit(config, "user1");
      expect(result.allowed).toBe(true);
    });
  });
});
