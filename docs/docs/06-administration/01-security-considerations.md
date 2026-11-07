# Security Considerations

If you're going to give app access to untrusted users, there's some security considerations that you'll need to be aware of given how the crawler works. The crawler is basically running a browser to fetch the content of the bookmarks. Any untrusted user can submit bookmarks to be crawled from your server and they'll be able to see the crawling result. This can be abused in multiple ways:

1. Untrusted users can submit crawl requests to websites that you don't want to be coming out of your IPs.
2. Crawling user controlled websites can expose your origin IP (and location) even if your service is hosted behind cloudflare for example.
3. The crawling requests will be coming out from your own network, which untrusted users can leverage to crawl internal non-internet exposed endpoints.

To mitigate those risks, you can do one of the following:

1. Limit access to trusted users
2. Let the browser traffic go through some VPN with restricted network policies.
3. Host the browser container outside of your network.
4. Use a hosted browser as a service (e.g. [browserless](https://browserless.io)). Note: I've never used them before.

To mitigate some of the risks, Karakeep has basic Server-Side Request Forgery (SSRF) protections to avoid probing internal endpoints. However, those checks mitigate only some of the risks. If you want to harden your Karakeep instance, configure a crawler proxy that's running outside of your internal network.

## Rate limiting and client IPs

When `RATE_LIMITING_ENABLED` is set, anonymous requests such as sign-in and sign-up are rate limited per client IP. Karakeep works out the client IP from the `X-Forwarded-For` header: it takes the right-most entry that isn't one of your `TRUSTED_PROXIES` (by default, any loopback or private-network address). Values a client puts in the header itself end up to the left of the address your proxy adds, so they're ignored.

This only works if requests reach Karakeep through your reverse proxy. If Karakeep's port is reachable directly (for example because it's published on all interfaces, as in the default `docker-compose.yml`), a client can send its own `X-Forwarded-For` header and pick the IP it's limited by. If you rely on IP rate limits:

1. Run Karakeep behind a reverse proxy that appends the client's address to `X-Forwarded-For` (or replaces the header). Caddy and Traefik do this by default; for nginx, set `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.
2. Don't expose Karakeep's port other than through that proxy, e.g. publish it as `127.0.0.1:3000:3000`.
3. If your proxy isn't on the same host or Docker network, add its address to `TRUSTED_PROXIES`.

Sign-in and password reset requests are also limited per email address, which doesn't depend on the client IP, so password guessing against one account stays limited either way.
