# Cloudflare Browser Run

Karakeep can use [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/) instead of a local Chrome container. The crawler connects directly from the Karakeep worker to Cloudflare's [CDP WebSocket endpoint](https://developers.cloudflare.com/browser-run/cdp/playwright/). No Cloudflare Worker, proxy, or Cloudflare-specific browser package is required.

## Scope and alternatives

Cloudflare also offers a [Markdown endpoint](https://developers.cloudflare.com/browser-run/quick-actions/markdown-endpoint/) that fetches pages and returns converted content. A content-only backend using that endpoint is a possible future option, but it would need an adapter for Karakeep's HTML-based metadata extraction and reader-view pipeline, with different capture capabilities.

This integration deliberately stays small and provider-agnostic: it adds standard CDP connections and generic connection settings rather than a Cloudflare-specific crawler. Karakeep keeps its existing extraction pipeline. HTML remains the primary webpage input; screenshots and PDFs remain optional captures.

## Configuration

1. Enable Browser Run on your Cloudflare account.
2. Create an account-scoped API token with **Browser Rendering - Edit** permission (also named **Browser Run Write** in some tools).
3. Configure the Karakeep worker:

```dotenv
BROWSER_CDP_URL=wss://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/browser-run/devtools/browser
BROWSER_CONNECT_HEADERS='{"Authorization":"Bearer YOUR_API_TOKEN"}'
BROWSER_CONNECT_TIMEOUT_SEC=30
# For the free plan: leave a small margin over the 20-second acquisition limit.
BROWSER_CONNECT_MIN_INTERVAL_MS=21000
BROWSER_CONNECT_ONDEMAND=true
BROWSER_CDP_CLOSE_ON_RELEASE=true
```

:::warning

Remove `BROWSER_WEB_URL` and `BROWSER_WEBSOCKET_URL` from the worker's environment. The standard Docker Compose setup supplies `BROWSER_WEB_URL` in the compose file, so removing it only from `.env` is not sufficient. You may also remove the local Chrome service once nothing else uses it.

Keep `BROWSER_CONNECT_HEADERS` private. Do not commit the token or paste it into logs or bug reports.

:::

The URL above **acquires a new browser session** for each connection. `BROWSER_CDP_CLOSE_ON_RELEASE=true` explicitly terminates that owned session after the crawl, including failed or cancelled crawls. This avoids leaving a disconnected browser running until its idle timeout.

Do not enable explicit termination for an existing/shared browser or a session used by other applications. In that case, leave `BROWSER_CDP_CLOSE_ON_RELEASE=false`.

Direct CDP endpoints default to on-demand connections. Keeping a persistent connection to a metered browser is not recommended: the crawler's reconnect loop can acquire new sessions when an idle session expires, even when no bookmarks are being crawled.

## What is preserved

The normal Karakeep crawler still handles navigation, JavaScript execution, cookies, request interception, adblocking, consent handling, HTML extraction, screenshots, and PDFs. Browser Run replaces the browser process, not the crawler's extraction or storage logic.

The browser connection's authorization header is **not** sent to bookmarked websites. Use `BROWSER_COOKIE_PATH` for website authentication where appropriate.

The admin service-status page reports the CDP endpoint as configured but does not open a browser session to check it. A health check should not silently acquire a metered browser.

## Limits and caveats

- Browser sessions consume Cloudflare browser time. Review [pricing](https://developers.cloudflare.com/browser-run/pricing/) and [limits](https://developers.cloudflare.com/browser-run/limits/) before enabling the integration.
- Cloudflare's free plan currently permits 10 minutes of browser time per day, three concurrent browsers, and one new browser every 20 seconds. Set `BROWSER_CONNECT_MIN_INTERVAL_MS=21000` to space connection attempts, including retries, slightly beyond that limit. This does not increase the daily browser-time allowance or implement session pooling.
- Connection throttling is generic and **per worker process**, shared across concurrent crawl jobs. It is not an account-wide limiter: other applications, multiple worker replicas, or a worker restart can still exceed a provider's limits. Throttle waiting counts toward `CRAWLER_JOB_TIMEOUT_SEC`; keep crawler concurrency low or increase that timeout when necessary. Cancelled crawls waiting for a slot do not acquire a new session.
- Leave `CRAWLER_NUM_WORKERS` low initially. Each concurrent browser crawl acquires its own session.
- Browser Run is not a CAPTCHA bypass. Cloudflare [identifies Browser Run requests as bot traffic](https://developers.cloudflare.com/browser-run/faq/#will-browser-run-be-detected-by-bot-management), and protected sites can still block them.
- Browser Run does not reach private services on your local network. Do not assume a configured crawler proxy or LAN-only proxy will be usable from Cloudflare.
- Only browser operations move to Cloudflare. Karakeep's HTTP probes, asset downloads, video downloads, and full-page archival operations can still run from the Karakeep host.

## Live smoke test (development checkout)

With the configuration above exported into the shell, run:

```sh
pnpm --filter @karakeep/workers test:browser-cdp
```

The test uses the project's actual Patchright client and browser connection module, then the real `crawlPage()` path against `https://example.com`. It checks isolated contexts, cookies, init scripts, JavaScript, request interception, HTML, JPEG screenshots, PDF capture, and a cancelled crawl. It requires an owned on-demand CDP endpoint with explicit termination enabled.

The test redirects app storage to a temporary directory, does not create bookmarks, and removes the temporary directory on exit. Set `CDP_SMOKE_OUTPUT_DIR` to keep the public example page's screenshot and PDF outside that temporary directory. This is an opt-in live test that consumes browser time; it is not part of the regular test suite.
