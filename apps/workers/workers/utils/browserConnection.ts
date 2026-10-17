import * as dns from "node:dns";
import { createRequire } from "node:module";
import { Mutex } from "async-mutex";
import { chromium } from "patchright";
import type { Browser } from "patchright";

import type serverConfig from "@karakeep/shared/config";
import { setUrlHostnameFromResolvedAddress } from "@karakeep/shared/utils/url";

import { redactUrlCredentials } from "./crawlerUtils";

export type BrowserConnectionConfig = Pick<
  typeof serverConfig.crawler,
  | "browserCdpUrl"
  | "browserWebSocketUrl"
  | "browserWebUrl"
  | "browserConnectHeaders"
  | "browserConnectTimeoutSec"
  | "browserConnectMinIntervalMs"
>;

const connectionStartMutex = new Mutex();
let lastConnectionAttemptAt: number | undefined;

async function waitForConnectionDelay(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Abort promptly even while queued; release a lock granted after cancellation. */
async function acquireConnectionStartLock(
  signal?: AbortSignal,
): Promise<() => void> {
  return await new Promise<() => void>((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => {
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    void connectionStartMutex.acquire().then(
      (release) => {
        signal?.removeEventListener("abort", abort);
        if (signal?.aborted) {
          release();
          reject(signal.reason);
        } else {
          resolve(release);
        }
      },
      (error: unknown) => {
        signal?.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** Space actual connection starts across all crawl jobs in this process. */
async function connectThrottled(
  connect: () => Promise<Browser>,
  intervalMs: number,
  signal?: AbortSignal,
): Promise<Browser> {
  signal?.throwIfAborted();
  if (intervalMs === 0) return await connect();

  const release = await acquireConnectionStartLock(signal);
  let connection: Promise<Browser>;
  try {
    signal?.throwIfAborted();
    if (lastConnectionAttemptAt !== undefined) {
      let remaining =
        intervalMs - (performance.now() - lastConnectionAttemptAt);
      // Recheck the monotonic clock: timers can wake slightly early.
      while (remaining > 0) {
        await waitForConnectionDelay(Math.ceil(remaining), signal);
        signal?.throwIfAborted();
        remaining = intervalMs - (performance.now() - lastConnectionAttemptAt);
      }
    }
    signal?.throwIfAborted();
    // Failed handshakes count too. Hold the mutex only until dispatch, not
    // until the connection completes, so in-flight connections can overlap.
    lastConnectionAttemptAt = performance.now();
    connection = connect();
  } finally {
    release();
  }
  return await connection;
}

/** Connect using the endpoint's protocol, without changing legacy URL semantics. */
export async function connectBrowser(
  config: BrowserConnectionConfig,
  signal?: AbortSignal,
): Promise<Browser | undefined> {
  const timeout = config.browserConnectTimeoutSec * 1000;
  const headers = config.browserConnectHeaders;
  const connect = (start: () => Promise<Browser>) =>
    connectThrottled(start, config.browserConnectMinIntervalMs, signal);
  try {
    if (config.browserCdpUrl) {
      // Preserve the hostname for TLS/SNI. This is a CDP WebSocket, not a
      // Playwright server endpoint, and needs no /json/version discovery.
      const endpoint = config.browserCdpUrl;
      return await connect(() =>
        chromium.connectOverCDP(endpoint, {
          timeout,
          headers,
        }),
      );
    }
    if (config.browserWebSocketUrl) {
      // Browserless selects a compatible server using this user agent.
      // Patchright's version has a "v" prefix that Playwright servers reject.
      const { version } = createRequire(import.meta.url)(
        "patchright/package.json",
      ) as { version: string };
      const endpoint = config.browserWebSocketUrl;
      return await connect(() =>
        chromium.connect(endpoint, {
          timeout,
          headers: {
            "User-Agent": `Playwright/${version.replace(/^v/, "")}`,
            ...headers,
          },
        }),
      );
    }
    if (config.browserWebUrl) {
      const webUrl = new URL(config.browserWebUrl);
      // Chrome's HTTP DevTools discovery rejects non-IP Host headers. Keep
      // that workaround for plain HTTP, but never break TLS host validation.
      if (webUrl.protocol === "http:") {
        const { address } = await dns.promises.lookup(webUrl.hostname);
        setUrlHostnameFromResolvedAddress(webUrl, address);
      }
      return await connect(() =>
        chromium.connectOverCDP(webUrl.toString(), {
          timeout,
          headers,
        }),
      );
    }
    return undefined;
  } catch (error) {
    // Playwright errors can include endpoint URLs and handshake headers.
    // Do not propagate the raw error/cause to queue logs or tracing.
    let message = error instanceof Error ? error.message : "Unknown error";
    const secrets = new Set<string>();
    for (const url of [
      config.browserCdpUrl,
      config.browserWebSocketUrl,
      config.browserWebUrl,
    ]) {
      if (!url) continue;
      message = message.split(url).join(redactUrlCredentials(url));
      const parsed = URL.parse(url);
      if (!parsed) continue;
      for (const value of [
        parsed.username,
        parsed.password,
        ...parsed.searchParams.values(),
      ]) {
        if (value) {
          secrets.add(value);
          try {
            secrets.add(decodeURIComponent(value));
          } catch {
            // Malformed percent-encoding should not defeat error redaction.
          }
        }
      }
    }
    for (const value of Object.values(headers)) {
      if (value) {
        secrets.add(value);
        // A server may echo only the bearer token rather than the full header.
        const token = value.replace(/^Bearer\s+/i, "");
        if (token) secrets.add(token);
      }
    }
    for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
      message = message.split(secret).join("REDACTED");
    }
    const failure = new Error(`Browser connection failed: ${message}`);
    if (signal?.aborted) {
      // Keep cancellation distinguishable without propagating a raw reason
      // or cause that might contain connection credentials.
      failure.name =
        signal.reason instanceof Error && signal.reason.name === "TimeoutError"
          ? "TimeoutError"
          : "AbortError";
    }
    throw failure;
  }
}

/**
 * CDP close normally disconnects without terminating the remote browser.
 * Explicit termination is opt-in, and only appropriate for an owned session.
 * Bound both termination and disconnect so cleanup cannot wedge a crawl.
 */
export async function closeBrowserConnection(
  browser: Browser,
  terminateCdpSession: boolean,
  timeoutMs = 10_000,
): Promise<void> {
  const withTimeout = async (operation: Promise<void>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Browser connection cleanup timed out")),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    if (terminateCdpSession && browser.isConnected()) {
      await withTimeout(
        (async () => {
          const session = await browser.newBrowserCDPSession();
          try {
            await session.send("Browser.close");
          } catch (error) {
            // A successful Browser.close can tear down CDP before its reply.
            if (browser.isConnected()) throw error;
          }
        })(),
      );
    }
  } finally {
    // Even if remote termination hangs, disconnect the local client.
    await withTimeout(browser.close());
  }
}
