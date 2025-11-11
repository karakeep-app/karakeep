# Using Custom Headers with Reverse Proxies

When deploying Karakeep behind a reverse proxy or CDN (like Cloudflare, Nginx, or AWS CloudFront), you may want to use custom headers for authentication, routing, or other purposes. This guide explains how to properly configure custom headers to avoid CORS errors.

## Understanding Custom Headers

Karakeep supports custom headers for API requests, which can be configured in:
- Browser extensions (via the Custom Headers settings page)
- Mobile app (via the Custom Headers modal)
- CLI tools
- Direct API calls

These custom headers are sent alongside the standard `Authorization` header when making requests to your Karakeep server.

## The CORS Challenge

Karakeep's API is configured to accept only specific headers for CORS (Cross-Origin Resource Sharing) requests:
- `Authorization`
- `Content-Type`

If your reverse proxy forwards additional custom headers directly to the Karakeep server, browsers will reject the response with a CORS error because those headers aren't in the allowed list.

## Solution: Strip Custom Headers at the Proxy

The key to using custom headers with a reverse proxy is to **consume the headers at the proxy level and strip them before forwarding the request** to Karakeep's backend server.

### Why This Works

1. Your client (browser extension, mobile app, etc.) sends the request with custom headers to your proxy
2. The proxy reads and processes these custom headers (e.g., for authentication, routing, rate limiting)
3. The proxy strips the custom headers before forwarding the request to Karakeep
4. Karakeep receives a clean request with only the standard headers
5. No CORS errors occur because only allowed headers reach the Karakeep server

## Example: Cloudflare Workers

Here's an example of using Cloudflare Workers to handle custom headers:

```javascript
export default {
  async fetch(request, env) {
    // Extract custom headers
    const customAuth = request.headers.get('X-Custom-Auth');
    const customRegion = request.headers.get('X-Custom-Region');

    // Perform custom logic (authentication, routing, etc.)
    if (customAuth) {
      // Validate custom authentication
      const isValid = await validateCustomAuth(customAuth);
      if (!isValid) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    // Route based on custom headers
    const targetUrl = customRegion === 'eu'
      ? 'https://eu.karakeep.example.com'
      : 'https://karakeep.example.com';

    // Create a new request WITHOUT custom headers
    const modifiedRequest = new Request(
      targetUrl + new URL(request.url).pathname + new URL(request.url).search,
      {
        method: request.method,
        headers: new Headers({
          // Only forward allowed headers
          'Authorization': request.headers.get('Authorization') || '',
          'Content-Type': request.headers.get('Content-Type') || 'application/json',
        }),
        body: request.body,
      }
    );

    // Forward to Karakeep server
    return fetch(modifiedRequest);
  }
};
```

## Example: Nginx Configuration

If you're using Nginx as a reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name karakeep.example.com;

    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        # Read custom headers for processing
        set $custom_auth $http_x_custom_auth;
        set $custom_region $http_x_custom_region;

        # You can use these for conditional logic, logging, etc.
        # For example, add to access log:
        access_log /var/log/nginx/karakeep.log combined;

        # Strip custom headers before proxying
        proxy_set_header X-Custom-Auth "";
        proxy_set_header X-Custom-Region "";

        # Forward only standard headers
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Content-Type $content_type;

        # Proxy to Karakeep
        proxy_pass http://localhost:3000;
    }
}
```

## Common Use Cases

### Custom Authentication Layer

You might use custom headers to add an additional authentication layer before requests reach Karakeep:

```javascript
// Client sends both custom auth and Karakeep API key
headers: {
  'X-Custom-Auth': 'my-secret-token',
  'Authorization': 'Bearer karakeep-api-key-here'
}

// Proxy validates X-Custom-Auth, strips it, forwards only Authorization
```

### Multi-Region Routing

Route requests to different Karakeep instances based on custom headers:

```javascript
// Client specifies region
headers: {
  'X-Region': 'eu',
  'Authorization': 'Bearer karakeep-api-key-here'
}

// Proxy routes to eu.karakeep.example.com based on X-Region
// Then strips X-Region before forwarding
```

### Rate Limiting Per Client

Implement custom rate limiting based on client identifiers:

```javascript
// Client identifies itself
headers: {
  'X-Client-ID': 'mobile-app-v1.2',
  'Authorization': 'Bearer karakeep-api-key-here'
}

// Proxy applies rate limits based on X-Client-ID
// Then strips X-Client-ID before forwarding
```

## Important Warnings

:::danger
**Always strip custom headers before forwarding to Karakeep.** If custom headers reach the Karakeep server, you will encounter CORS errors such as:

```
Access to fetch at 'https://karakeep.example.com/api/v1/bookmarks'
from origin 'https://app.example.com' has been blocked by CORS policy:
Request header field x-custom-header is not allowed by
Access-Control-Allow-Headers in preflight response.
```
:::

:::warning
Custom headers are sent in plaintext (unless using HTTPS). Never put sensitive information in custom headers without proper encryption and authentication at the proxy level.
:::

## Testing Your Configuration

To verify your proxy is correctly stripping custom headers:

1. Use browser developer tools to inspect network requests
2. Check the request headers sent to your proxy include your custom headers
3. Use a tool like `tcpdump` or Cloudflare logs to verify the request forwarded to Karakeep does NOT include custom headers
4. Verify no CORS errors appear in the browser console

Example test using curl:

```bash
# This should work (proxy strips X-Custom-Header)
curl -H "X-Custom-Header: test" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     https://your-proxy.example.com/api/v1/bookmarks

# This would fail with CORS if custom header reaches Karakeep
curl -H "X-Custom-Header: test" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     https://karakeep-backend.example.com/api/v1/bookmarks
```

## Troubleshooting

### CORS Error Still Appears

- Verify your proxy is actually stripping the custom headers
- Check that you're not setting headers in multiple places (client + proxy)
- Ensure the proxy creates a fresh request object with only allowed headers

### Custom Headers Not Being Processed

- Verify your client is sending the headers correctly
- Check proxy logs to ensure headers are being received
- Confirm header names match exactly (they're case-insensitive per HTTP spec, but implementations may vary)

### Headers Appear in Karakeep Logs

If you see unexpected headers in Karakeep's logs, your proxy isn't stripping them correctly. Review your proxy configuration to ensure headers are being removed before forwarding.

## Summary

When using custom headers with Karakeep behind a reverse proxy:

1. **Send** custom headers from your client to the proxy
2. **Process** custom headers at the proxy for your use case
3. **Strip** custom headers before forwarding to Karakeep
4. **Forward** only `Authorization` and `Content-Type` headers to Karakeep
5. **Test** thoroughly to ensure no CORS errors occur

This approach gives you the flexibility of custom headers while maintaining compatibility with Karakeep's CORS configuration.
