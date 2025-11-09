import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RateLimitClient } from "@karakeep/shared/ratelimiting";

import { RateLimitProvider } from "./index";

// Mock serverConfig to enable rate limiting
vi.mock("@karakeep/shared/config", () => ({
  default: {
    rateLimiting: {
      enabled: true,
    },
  },
}));

describe("RateLimitProvider", () => {
  let provider: RateLimitProvider;

  beforeEach(() => {
    provider = new RateLimitProvider();
  });

  afterEach(async () => {
    const client = await provider.getClient();
    if (client) {
      client.clear();
    }
  });

  it("should implement PluginProvider interface", () => {
    expect(provider).toHaveProperty("getClient");
    expect(typeof provider.getClient).toBe("function");
  });

  it("should return a RateLimitClient", async () => {
    const client = await provider.getClient();

    expect(client).not.toBeNull();
    expect(client).toHaveProperty("checkRateLimit");
    expect(client).toHaveProperty("reset");
    expect(client).toHaveProperty("clear");
  });

  it("should return the same client instance on multiple calls", async () => {
    const client1 = await provider.getClient();
    const client2 = await provider.getClient();

    expect(client1).toBe(client2);
  });

  it("should provide a functional rate limit client", async () => {
    const client = (await provider.getClient()) as RateLimitClient;

    const config = {
      name: "test",
      windowMs: 60000,
      maxRequests: 2,
    };

    const result1 = client.checkRateLimit(config, "user1");
    const result2 = client.checkRateLimit(config, "user1");
    const result3 = client.checkRateLimit(config, "user1");

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result3.allowed).toBe(false);
  });
});
