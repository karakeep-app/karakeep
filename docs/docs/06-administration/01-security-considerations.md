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

## Exposing Karakeep to the internet

If Karakeep is reachable from the internet, put it behind a reverse proxy that terminates TLS (e.g. nginx, Caddy or Traefik) and set `NEXTAUTH_URL` to the public `https://` address. Then make sure the proxy is the only way in. The default `docker-compose.yml` publishes `3000:3000` on every network interface, so Karakeep stays reachable over plain HTTP at `http://<server-ip>:3000`, bypassing the proxy and its TLS. Docker writes its own firewall rules for published ports, so host firewalls such as `ufw` don't block this.

If the proxy runs directly on the host, publish the port on the loopback interface only and point the proxy at `127.0.0.1:3000`:

```yaml
services:
  web:
    ports:
      - 127.0.0.1:3000:3000
```

If the proxy runs in a Docker container, remove the `ports:` section from the `web` service instead, and put the proxy and Karakeep on a shared Docker network (created once with `docker network create proxy`). The proxy then reaches Karakeep at `http://web:3000`:

```yaml
services:
  web:
    networks:
      - default
      - proxy

networks:
  proxy:
    external: true
```

To verify, `curl http://<server-ip>:3000` from another machine should fail, while your `https://` address keeps working.
