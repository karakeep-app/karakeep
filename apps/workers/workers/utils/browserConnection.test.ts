import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Browser } from "patchright";

import { closeBrowserConnection, connectBrowser } from "./browserConnection";
import type { BrowserConnectionConfig } from "./browserConnection";

const { connect, connectOverCDP, lookup } = vi.hoisted(() => ({
  connect: vi.fn(),
  connectOverCDP: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("patchright", () => ({ chromium: { connect, connectOverCDP } }));
vi.mock("node:dns", () => ({ promises: { lookup } }));

const defaults: BrowserConnectionConfig = {
  browserCdpUrl: undefined,
  browserWebSocketUrl: undefined,
  browserWebUrl: undefined,
  browserConnectHeaders: {},
  browserConnectTimeoutSec: 5,
  browserConnectMinIntervalMs: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("connectBrowser", () => {
  it("connects directly to CDP with headers and preserves the TLS hostname", async () => {
    const url =
      "wss://api.cloudflare.com/client/v4/accounts/test/browser-run/devtools/browser";
    await connectBrowser({
      ...defaults,
      browserCdpUrl: url,
      browserConnectHeaders: { Authorization: "Bearer test-secret" },
      browserConnectTimeoutSec: 30,
    });
    expect(connectOverCDP).toHaveBeenCalledWith(url, {
      headers: { Authorization: "Bearer test-secret" },
      timeout: 30_000,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps the legacy Playwright protocol and compatible client user agent", async () => {
    const url = "wss://browserless.example/playwright";
    await connectBrowser({ ...defaults, browserWebSocketUrl: url });
    expect(connect).toHaveBeenCalledWith(url, {
      timeout: 5000,
      headers: {
        "User-Agent": expect.stringMatching(/^Playwright\/\d+\.\d+\.\d+$/),
      },
    });
    expect(connectOverCDP).not.toHaveBeenCalled();
  });

  it("keeps the IP Host workaround for local HTTP Chrome", async () => {
    lookup.mockResolvedValueOnce({ address: "127.0.0.1" });
    await connectBrowser({ ...defaults, browserWebUrl: "http://chrome:9222" });
    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9222/", {
      timeout: 5000,
      headers: {},
    });
  });

  it("preserves HTTPS discovery hostnames and passes connection headers", async () => {
    await connectBrowser({
      ...defaults,
      browserWebUrl: "https://chrome.example/debug",
      browserConnectHeaders: { Authorization: "Bearer secret" },
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(connectOverCDP).toHaveBeenCalledWith(
      "https://chrome.example/debug",
      {
        timeout: 5000,
        headers: { Authorization: "Bearer secret" },
      },
    );
  });

  it("returns no browser when no endpoint is configured", async () => {
    expect(await connectBrowser(defaults)).toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
    expect(connectOverCDP).not.toHaveBeenCalled();
  });

  it("redacts URLs and echoed authorization values without retaining a cause", async () => {
    const url =
      "wss://user:password@browser.example/connect?token=query-secret";
    connectOverCDP.mockRejectedValueOnce(
      new Error(
        `401 at ${url}; Authorization: Bearer header-secret; echoed header-secret`,
      ),
    );
    const error = await connectBrowser({
      ...defaults,
      browserCdpUrl: url,
      browserConnectHeaders: { Authorization: "Bearer header-secret" },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("401");
    for (const secret of [
      "user",
      "password",
      "query-secret",
      "header-secret",
    ]) {
      expect(message).not.toContain(secret);
    }
    expect((error as Error).cause).toBeUndefined();
  });

  it("does not let malformed percent encoding break redaction", async () => {
    connectOverCDP.mockRejectedValueOnce(new Error("Bearer secret"));
    await expect(
      connectBrowser({
        ...defaults,
        browserCdpUrl: "wss://browser.example/?token=%bad",
        browserConnectHeaders: { Authorization: "Bearer secret" },
      }),
    ).rejects.toThrow("Browser connection failed: REDACTED");
  });
});

describe("browser connection throttling", () => {
  let throttledConnect: typeof connectBrowser;
  const limited: BrowserConnectionConfig = {
    ...defaults,
    browserCdpUrl: "wss://browser.example/session",
    browserConnectMinIntervalMs: 21_000,
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.resetModules();
    throttledConnect = (await import("./browserConnection")).connectBrowser;
  });
  afterEach(() => vi.useRealTimers());

  it.each(["cdp", "playwright", "http"])(
    "spaces concurrent %s connection starts",
    async (protocol) => {
      const starts: number[] = [];
      const start = () => {
        starts.push(performance.now());
        return Promise.resolve(fakeBrowser().browser);
      };
      connectOverCDP.mockImplementation(start);
      connect.mockImplementation(start);
      lookup.mockResolvedValue({ address: "127.0.0.1" });
      const config = {
        ...limited,
        browserCdpUrl: protocol === "cdp" ? limited.browserCdpUrl : undefined,
        browserWebSocketUrl:
          protocol === "playwright"
            ? "wss://browser.example/playwright"
            : undefined,
        browserWebUrl: protocol === "http" ? "http://chrome:9222" : undefined,
      };
      const pending = [
        throttledConnect(config),
        throttledConnect(config),
        throttledConnect(config),
      ];
      await vi.advanceTimersByTimeAsync(0);
      expect(starts).toEqual([0]);
      await vi.advanceTimersByTimeAsync(20_999);
      expect(starts).toEqual([0]);
      await vi.advanceTimersByTimeAsync(1);
      expect(starts).toEqual([0, 21_000]);
      await vi.advanceTimersByTimeAsync(21_000);
      expect(starts).toEqual([0, 21_000, 42_000]);
      await Promise.all(pending);
    },
  );

  it("does not hold the start lock while a connection is in flight", async () => {
    let finishFirst: (browser: Browser) => void = () => {
      throw new Error("First connection has not started");
    };
    connectOverCDP
      .mockImplementationOnce(
        () =>
          new Promise<Browser>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValue(fakeBrowser().browser);
    const first = throttledConnect(limited);
    const second = throttledConnect(limited);
    await vi.advanceTimersByTimeAsync(0);
    expect(connectOverCDP).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(connectOverCDP).toHaveBeenCalledTimes(2);
    await second;
    finishFirst(fakeBrowser().browser);
    await first;
  });

  it("counts failed connection attempts before allowing a retry", async () => {
    connectOverCDP
      .mockRejectedValueOnce(new Error("HTTP 429"))
      .mockResolvedValue(fakeBrowser().browser);
    await expect(throttledConnect(limited)).rejects.toThrow("429");
    const retry = throttledConnect(limited);
    await vi.advanceTimersByTimeAsync(20_999);
    expect(connectOverCDP).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await retry;
    expect(connectOverCDP).toHaveBeenCalledTimes(2);
  });

  it("cancels a throttled wait without acquiring a browser or consuming a slot", async () => {
    connectOverCDP.mockResolvedValue(fakeBrowser().browser);
    await throttledConnect(limited);
    const abort = new AbortController();
    const cancelled = throttledConnect(limited, abort.signal);
    const rejection = expect(cancelled).rejects.toThrow("aborted");
    const next = throttledConnect(limited);
    await vi.advanceTimersByTimeAsync(0);
    abort.abort();
    await vi.advanceTimersByTimeAsync(0);
    await rejection;
    expect(connectOverCDP).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(21_000);
    await next;
    expect(connectOverCDP).toHaveBeenCalledTimes(2);
  });

  it("cancels a queued waiter promptly and releases its eventual lock", async () => {
    connectOverCDP.mockResolvedValue(fakeBrowser().browser);
    await throttledConnect(limited);
    const waiting = throttledConnect(limited);
    const abort = new AbortController();
    const queued = throttledConnect(limited, abort.signal);
    const rejection = expect(queued).rejects.toMatchObject({
      name: "AbortError",
    });
    const next = throttledConnect(limited);
    await vi.advanceTimersByTimeAsync(0);
    abort.abort();
    await vi.advanceTimersByTimeAsync(0);
    await rejection;
    expect(performance.now()).toBe(0);
    expect(connectOverCDP).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(21_000);
    await waiting;
    expect(connectOverCDP).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(21_000);
    await next;
    expect(connectOverCDP).toHaveBeenCalledTimes(3);
  });

  it("preserves timeout identity without exposing credentials in the abort reason", async () => {
    const abort = new AbortController();
    abort.abort(new DOMException("Bearer test-secret", "TimeoutError"));
    const error = await throttledConnect(
      {
        ...limited,
        browserConnectHeaders: { Authorization: "Bearer test-secret" },
      },
      abort.signal,
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: "TimeoutError" });
    expect((error as Error).message).not.toContain("test-secret");
    expect(connectOverCDP).not.toHaveBeenCalled();
  });

  it("never acquires a browser for an already cancelled crawl", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(throttledConnect(limited, abort.signal)).rejects.toThrow();
    expect(connectOverCDP).not.toHaveBeenCalled();
  });

  it("keeps the default unthrottled and skips slots when no browser is configured", async () => {
    connectOverCDP.mockResolvedValue(fakeBrowser().browser);
    await throttledConnect({ ...limited, browserCdpUrl: undefined });
    await throttledConnect(limited);
    expect(connectOverCDP).toHaveBeenCalledTimes(1);
    await Promise.all([
      throttledConnect({ ...limited, browserConnectMinIntervalMs: 0 }),
      throttledConnect({ ...limited, browserConnectMinIntervalMs: 0 }),
    ]);
    expect(connectOverCDP).toHaveBeenCalledTimes(3);
    expect(performance.now()).toBe(0);
  });
});

function fakeBrowser() {
  const send = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const isConnected = vi.fn().mockReturnValue(true);
  const newBrowserCDPSession = vi.fn().mockResolvedValue({ send });
  const browser = {
    close,
    isConnected,
    newBrowserCDPSession,
  } as unknown as Browser;
  return { browser, close, send, isConnected, newBrowserCDPSession };
}

describe("closeBrowserConnection", () => {
  it("only disconnects shared/existing remote sessions by default", async () => {
    const b = fakeBrowser();
    await closeBrowserConnection(b.browser, false);
    expect(b.newBrowserCDPSession).not.toHaveBeenCalled();
    expect(b.close).toHaveBeenCalledOnce();
  });

  it("explicitly terminates an owned CDP session before disconnecting", async () => {
    const b = fakeBrowser();
    await closeBrowserConnection(b.browser, true);
    expect(b.send).toHaveBeenCalledWith("Browser.close");
    expect(b.close).toHaveBeenCalledOnce();
    expect(b.send.mock.invocationCallOrder[0]).toBeLessThan(
      b.close.mock.invocationCallOrder[0]!,
    );
  });

  it("accepts disconnect during a successful Browser.close", async () => {
    const b = fakeBrowser();
    b.send.mockImplementationOnce(async () => {
      b.isConnected.mockReturnValue(false);
      throw new Error("Target closed");
    });
    await expect(
      closeBrowserConnection(b.browser, true),
    ).resolves.toBeUndefined();
    expect(b.close).toHaveBeenCalledOnce();
  });

  it("still disconnects if remote termination fails", async () => {
    const b = fakeBrowser();
    b.send.mockRejectedValueOnce(new Error("Unsupported command"));
    await expect(closeBrowserConnection(b.browser, true)).rejects.toThrow(
      "Unsupported command",
    );
    expect(b.close).toHaveBeenCalledOnce();
  });

  it("bounds cleanup time even when remote termination hangs", async () => {
    const b = fakeBrowser();
    b.send.mockReturnValueOnce(
      new Promise(() => {
        // Deliberately never settle: simulate an unresponsive remote browser.
      }),
    );
    await expect(closeBrowserConnection(b.browser, true, 5)).rejects.toThrow(
      "cleanup timed out",
    );
    expect(b.close).toHaveBeenCalledOnce();
  });
});
