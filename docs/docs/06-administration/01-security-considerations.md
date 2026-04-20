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
