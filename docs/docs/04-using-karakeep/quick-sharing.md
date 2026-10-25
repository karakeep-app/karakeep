---
sidebar_position: 7
slug: quick-sharing
---

# Quick capture and sharing

The whole point of Karakeep is making it easy to hoard the content. That's why there are a couple of 

## Mobile Apps

<img src="/img/quick-sharing/mobile.png" alt="mobile screenshot" width="300"/>


- **iOS app**: [App Store Link](https://apps.apple.com/us/app/karakeep-app/id6479258022).
- **Android App**: [Play Store link](https://play.google.com/store/apps/details?id=app.hoarder.hoardermobile&pcampaignid=web_share).

## Browser Extensions

<img src="/img/quick-sharing/extension.png" alt="mobile screenshot" width="300"/>

- **Chrome extension**: [here](https://chromewebstore.google.com/detail/karakeep/kgcjekpmcjjogibpjebkhaanilehneje).
- **Firefox addon**: [here](https://addons.mozilla.org/en-US/firefox/addon/karakeep/).

### Signing in through an authentication proxy

If your Karakeep server is behind an interactive sign-in service such as
Cloudflare Access, you can opt in to using the existing browser session:

1. Configure your server address in the extension.
2. On the **Login** page, enable **Use existing browser session** and grant access
   to that server when the browser asks. This option is also available in
   **Settings** after login.
3. Select **Open server to sign in**. Complete the proxy's normal sign-in flow in
   the same browser profile, including any multi-factor authentication.
4. Return to the extension and sign in to Karakeep with your Karakeep credentials
   or API key. Save a bookmark to verify the complete flow.

This option is off by default. When enabled, the browser attaches applicable
cookies to the extension's API requests to the configured server, including asset
uploads. Karakeep still requires its own authentication. The extension does not
read cookie values, upload browsing-session cookies from saved websites, or
store your proxy password. No `cookies` API permission is required.

The opt-in is bound to the server's origin (scheme, hostname and port), so it does
not automatically follow a change to another server. Use HTTPS for remote
servers. Turning the option off stops the explicit cookie inclusion; it does not
log you out of the proxy or revoke host permissions that may also be used by
client-side crawling. Permissions can be managed in the browser's extension
settings. If you revoke the server permission, toggle this option off and on to
request it again.

#### Proxy and server requirements

Browser-session support does not automatically configure the proxy or server.
The server permission is requested only for the configured scheme and hostname,
using the extension's existing optional host permissions. The permission pattern
omits the port for Firefox compatibility and can cover other ports on that host;
the cookie opt-in itself remains bound to the full origin including its port. Browser cookie, SameSite and
privacy policies still apply. Support for one proxy does not guarantee support
for every identity provider or browser.

Where the browser enforces CORS, the proxy must handle preflight requests and
return credential-compatible CORS headers on API responses:

- Allow the extension's exact origin; do not use `Access-Control-Allow-Origin: *`
  with credentials. Chrome origins look like `chrome-extension://<extension-id>`;
  Firefox uses a browser-assigned `moz-extension://<uuid>` origin. A local build
  may have a different origin from the store version.
- Return `Access-Control-Allow-Credentials: true` and, for dynamic origin
  selection, `Vary: Origin`. Match against an explicit allowlist before returning
  an origin.
- Allow the required methods (`GET`, `POST`, `OPTIONS`) and request headers
  (`Authorization`, `Content-Type`, and any explicitly configured custom headers).
- Cover tRPC requests under `/api/trpc/` and asset uploads to `/api/assets`,
  including error responses. A preflight response must not expose protected
  application data; keep authentication enforced on the actual API requests.

For Cloudflare Access, configure the application's CORS settings to answer the
allowed extension's preflights and configure compatible responses at the origin
proxy if needed. Keep your existing personal Access policy, session lifetime and
cookie protections. This mode does not require a Service Token or an Access
bypass rule. If the session expires, use **Open server to sign in** and retry; a
fetch request cannot complete an interactive sign-in or MFA challenge.

Custom Headers remain available as a separate way to authenticate to proxies
that accept them. This option does not implement a new OAuth/OIDC sign-in flow,
replace a provider's supported integration, or guarantee support for Microsoft
Entra Application Proxy or other untested proxies.

- ## Community Extensions
- **Safari extension**: [App Store Link](https://apps.apple.com/us/app/karakeeper-bookmarker/id6746722790).  For macOS and iOS to allow a simple way to add your bookmarks to your self hosted karakeep instance.
