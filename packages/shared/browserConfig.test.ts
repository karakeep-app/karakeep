import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserEnv = [
  "BROWSER_CDP_URL",
  "BROWSER_WEB_URL",
  "BROWSER_WEBSOCKET_URL",
  "BROWSER_CONNECT_HEADERS",
  "BROWSER_CONNECT_TIMEOUT_SEC",
  "BROWSER_CONNECT_MIN_INTERVAL_MS",
  "BROWSER_CONNECT_ONDEMAND",
  "BROWSER_CDP_CLOSE_ON_RELEASE",
];

beforeEach(() => {
  vi.resetModules();
  for (const name of browserEnv) vi.stubEnv(name, undefined);
});
afterEach(() => vi.unstubAllEnvs());

async function config() {
  return (await import("./config")).default;
}

describe("browser connection configuration", () => {
  it("preserves legacy defaults", async () => {
    const c = await config();
    expect(c.crawler.browserConnectOnDemand).toBe(false);
    expect(c.crawler.browserConnectHeaders).toEqual({});
    expect(c.crawler.browserConnectTimeoutSec).toBe(5);
    expect(c.crawler.browserConnectMinIntervalMs).toBe(0);
    expect(c.crawler.browserCdpCloseOnRelease).toBe(false);
  });

  it("defaults CDP connections to on-demand without assuming session ownership", async () => {
    vi.stubEnv("BROWSER_CDP_URL", "wss://browser.example/session");
    const c = await config();
    expect(c.crawler.browserConnectOnDemand).toBe(true);
    expect(c.crawler.browserCdpCloseOnRelease).toBe(false);
  });

  it("allows an explicitly persistent CDP connection", async () => {
    vi.stubEnv("BROWSER_CDP_URL", "ws://127.0.0.1:9222/session");
    vi.stubEnv("BROWSER_CONNECT_ONDEMAND", "false");
    expect((await config()).crawler.browserConnectOnDemand).toBe(false);
  });

  it.each(["BROWSER_WEB_URL", "BROWSER_WEBSOCKET_URL"])(
    "rejects CDP combined with %s",
    async (name) => {
      vi.stubEnv("BROWSER_CDP_URL", "wss://browser.example/session");
      vi.stubEnv(name, "http://chrome:9222");
      await expect(config()).rejects.toThrow("cannot be combined");
    },
  );

  it.each(["https://browser.example", "file:///tmp/browser"])(
    "rejects non-WebSocket CDP URL %s",
    async (url) => {
      vi.stubEnv("BROWSER_CDP_URL", url);
      await expect(config()).rejects.toThrow();
    },
  );

  it("requires an on-demand CDP connection for explicit remote termination", async () => {
    vi.stubEnv("BROWSER_CDP_CLOSE_ON_RELEASE", "true");
    await expect(config()).rejects.toThrow("requires BROWSER_CDP_URL");
    vi.resetModules();
    vi.stubEnv("BROWSER_CDP_URL", "wss://browser.example/session");
    vi.stubEnv("BROWSER_CONNECT_ONDEMAND", "false");
    await expect(config()).rejects.toThrow("on-demand connections");
  });

  it("accepts authenticated, owned on-demand CDP sessions without exposing headers to clients", async () => {
    vi.stubEnv("BROWSER_CDP_URL", "wss://browser.example/session");
    vi.stubEnv("BROWSER_CDP_CLOSE_ON_RELEASE", "true");
    vi.stubEnv(
      "BROWSER_CONNECT_HEADERS",
      '{"Authorization":"Bearer test-secret"}',
    );
    vi.stubEnv("BROWSER_CONNECT_TIMEOUT_SEC", "30");
    const c = await config();
    expect(c.crawler.browserConnectHeaders).toEqual({
      Authorization: "Bearer test-secret",
    });
    expect(c.crawler.browserConnectTimeoutSec).toBe(30);
    const { clientConfig } = await import("./config");
    expect(JSON.stringify(clientConfig)).not.toContain("test-secret");
  });

  it.each([
    '{"Authorization":"test-secret"',
    '["test-secret"]',
    '{"Authorization":42}',
    '{"Invalid Header":"test-secret"}',
    '{"Authorization":"test-secret\\r\\nInjected: header"}',
  ])(
    "rejects invalid headers without echoing their contents",
    async (headers) => {
      vi.stubEnv("BROWSER_CONNECT_HEADERS", headers);
      const error = await config().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "BROWSER_CONNECT_HEADERS must be",
      );
      expect((error as Error).message).not.toContain("test-secret");
    },
  );

  it("accepts a generic minimum connection interval", async () => {
    vi.stubEnv("BROWSER_CONNECT_MIN_INTERVAL_MS", "21000");
    expect((await config()).crawler.browserConnectMinIntervalMs).toBe(21_000);
  });

  it.each(["-1", "1.5", "not-a-number", "2147483648"])(
    "rejects invalid minimum connection interval %s",
    async (value) => {
      vi.stubEnv("BROWSER_CONNECT_MIN_INTERVAL_MS", value);
      await expect(config()).rejects.toThrow();
    },
  );

  it("rejects nonpositive connection timeouts", async () => {
    vi.stubEnv("BROWSER_CONNECT_TIMEOUT_SEC", "0");
    await expect(config()).rejects.toThrow();
  });
});
