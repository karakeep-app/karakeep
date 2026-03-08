/**
 * Maximum URL length for tRPC httpBatchLink requests.
 *
 * The web app uses a higher limit to support bulk operations (e.g.
 * drag-and-drop bookmark import from the browser) that produce large
 * batched request URLs. The trade-off is that users behind a reverse
 * proxy with strict default header limits may hit 431 errors on very
 * large batches.
 *
 * The mobile app and browser extension use a lower limit because they
 * don't need bulk operations and their requests always travel through
 * the user's server, which typically sits behind a reverse proxy.
 * nginx — the most common reverse proxy for self-hosted deployments —
 * defaults `large_client_header_buffers` to 4 × 8 KB, meaning a single
 * request line (including the URL) must fit within ~8 KB. 4,000
 * characters stays safely under that limit after accounting for the
 * method, HTTP version, and any URL-encoding overhead.
 *
 * Also see:
 * * https://github.com/karakeep-app/karakeep/issues/281
 * * https://github.com/karakeep-app/karakeep/issues/1619
 * * https://nginx.org/en/docs/http/ngx_http_core_module.html#large_client_header_buffers
 */
export const TRPC_MAX_URL_LENGTH_INTERNAL = 14000;
export const TRPC_MAX_URL_LENGTH_EXTERNAL = 4000;
