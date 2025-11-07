# Configuration

The app is mainly configured by environment variables. All the used environment variables are listed in [packages/shared/config.ts](https://github.com/karakeep-app/karakeep/blob/main/packages/shared/config.ts). The most important ones are:

| Name                            | Required                              | Default         | Description                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT                            | No                                    | 3000            | The port on which the web server will listen. DON'T CHANGE THIS IF YOU'RE USING DOCKER, instead changed the docker bound external port.                                                                                                                                                                                 |
| WORKERS_PORT                    | No                                    | 0 (Random Port) | The port on which the worker will export its prometheus metrics on `/metrics`. By default it's a random unused port. If you want to utilize those metrics, fix the port to a value (and export it in docker if you're using docker).                                                                                    |
| WORKERS_HOST                    | No                                    | 127.0.0.1       | Host to listen to for requests to WORKERS_PORT. You will need to set this if running in a container, since localhost will not be reachable from outside                                                                                                                                                                 |
| WORKERS_ENABLED_WORKERS         | No                                    | Not set         | Comma separated list of worker names to enable. If set, only these workers will run. Valid values: crawler,inference,search,adminMaintenance,video,feed,assetPreprocessing,webhook,ruleEngine.                                                                                                                          |
| WORKERS_DISABLED_WORKERS        | No                                    | Not set         | Comma separated list of worker names to disable. Takes precedence over `WORKERS_ENABLED_WORKERS`.                                                                                                                                                                                                                       |
| DATA_DIR                        | Yes                                   | Not set         | The path for the persistent data directory. This is where the db lives. Assets are stored here by default unless `ASSETS_DIR` is set.                                                                                                                                                                                   |
| ASSETS_DIR                      | No                                    | Not set         | The path where crawled assets will be stored. If not set, defaults to `${DATA_DIR}/assets`.                                                                                                                                                                                                                             |
| NEXTAUTH_URL                    | Yes                                   | Not set         | Should point to the address of your server. The app will function without it, but will redirect you to wrong addresses on signout for example.                                                                                                                                                                          |
| NEXTAUTH_SECRET                 | Yes                                   | Not set         | Random string used to sign the JWT tokens. Generate one with `openssl rand -base64 36`.                                                                                                                                                                                                                                 |
| MEILI_ADDR                      | No                                    | Not set         | The address of meilisearch. If not set, Search will be disabled. E.g. (`http://meilisearch:7700`)                                                                                                                                                                                                                       |
| MEILI_MASTER_KEY                | Only in Prod and if search is enabled | Not set         | The master key configured for meilisearch. Not needed in development environment. Generate one with `openssl rand -base64 36 \| tr -dc 'A-Za-z0-9'`                                                                                                                                                                     |
| MAX_ASSET_SIZE_MB               | No                                    | 50              | Sets the maximum allowed asset size (in MB) to be uploaded                                                                                                                                                                                                                                                              |
| DISABLE_NEW_RELEASE_CHECK       | No                                    | false           | If set to true, latest release check will be disabled in the admin panel.                                                                                                                                                                                                                                               |
| PROMETHEUS_AUTH_TOKEN           | No                                    | Random          | Enable a prometheus metrics endpoint at `/api/metrics`. This endpoint will require this token being passed in the Authorization header as a Bearer token. If not set, a new random token is generated everytime at startup. This cannot contain any special characters or you may encounter a 400 Bad Request response. |
| RATE_LIMITING_ENABLED           | No                                    | false           | If set to true, API rate limiting will be enabled.                                                                                                                                                                                                                                                                      |
| DB_WAL_MODE                     | No                                    | false           | Enables WAL mode for the sqlite database. This should improve the performance of the database. There's no reason why you shouldn't set this to true unless you're running the db on a network attached drive. This will become the default at some time in the future.                                                  |
| SEARCH_NUM_WORKERS              | No                                    | 1               | Number of concurrent workers for search indexing tasks. Increase this if you have a high volume of content being indexed for search.                                                                                                    |
| SEARCH_JOB_TIMEOUT_SEC          | No                                    | 30              | How long to wait for a search indexing job to finish before timing out. Increase this if you have large bookmarks with extensive content that takes longer to index.                                                                    |
| WEBHOOK_NUM_WORKERS             | No                                    | 1               | Number of concurrent workers for webhook delivery. Increase this if you have multiple webhook endpoints or high webhook traffic.                                                                                                        |
| ASSET_PREPROCESSING_NUM_WORKERS | No                                    | 1               | Number of concurrent workers for asset preprocessing tasks (image processing, OCR, etc.). Increase this if you have many images or documents that need processing.                                                                                                                                                      |
| RULE_ENGINE_NUM_WORKERS         | No                                    | 1               | Number of concurrent workers for rule engine processing. Increase this if you have complex automation rules that need to be processed quickly.                                                                                                                                                                          |

## Asset Storage

Karakeep supports two storage backends for assets: local filesystem (default) and S3-compatible object storage. S3 storage is automatically detected when an S3 endpoint is passed.

| Name                             | Required          | Default | Description                                                                                               |
| -------------------------------- | ----------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| ASSET_STORE_S3_ENDPOINT          | No                | Not set | The S3 endpoint URL. Required for S3-compatible services like MinIO. **Setting this enables S3 storage**. |
| ASSET_STORE_S3_REGION            | No                | Not set | The S3 region to use.                                                                                     |
| ASSET_STORE_S3_BUCKET            | Yes when using S3 | Not set | The S3 bucket name where assets will be stored.                                                           |
| ASSET_STORE_S3_ACCESS_KEY_ID     | Yes when using S3 | Not set | The S3 access key ID for authentication.                                                                  |
| ASSET_STORE_S3_SECRET_ACCESS_KEY | Yes when using S3 | Not set | The S3 secret access key for authentication.                                                              |
| ASSET_STORE_S3_FORCE_PATH_STYLE  | No                | false   | Whether to force path-style URLs for S3 requests. Set to true for MinIO and other S3-compatible services. |
## Crawler Configs

| Name                                     | Required | Default   | Description                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRAWLER_NUM_WORKERS                      | No       | 1         | Number of allowed concurrent crawling jobs. By default, we're only doing one crawling request at a time to avoid consuming a lot of resources.                                                                                                                                                                                                                                |
| BROWSER_WEB_URL                          | No       | Not set   | The browser's http debugging address. The worker will talk to this endpoint to resolve the debugging console's websocket address. If you already have the websocket address, use `BROWSER_WEBSOCKET_URL` instead. If neither `BROWSER_WEB_URL` nor `BROWSER_WEBSOCKET_URL` are set, the worker will use plain http requests skipping screenshotting and javascript execution. |
| BROWSER_WEBSOCKET_URL                    | No       | Not set   | The websocket address of browser's debugging console. If you want to use [browserless](https://browserless.io), use their websocket address here. If neither `BROWSER_WEB_URL` nor `BROWSER_WEBSOCKET_URL` are set, the worker will use plain http requests skipping screenshotting and javascript execution.                                                                 |
| BROWSER_CONNECT_ONDEMAND                 | No       | false     | If set to false, the crawler will proactively connect to the browser instance and always maintain an active connection. If set to true, the browser will be launched on demand only whenever a crawling is requested. Set to true if you're using a service that provides you with browser instances on demand.                                                               |
| CRAWLER_DOWNLOAD_BANNER_IMAGE            | No       | true      | Whether to cache the banner image used in the cards locally or fetch it each time directly from the website. Caching it consumes more storage space, but is more resilient against link rot and rate limits from websites.                                                                                                                                                    |
| CRAWLER_STORE_SCREENSHOT                 | No       | true      | Whether to store a screenshot from the crawled website or not. Screenshots act as a fallback for when we fail to extract an image from a website. You can also view the stored screenshots for any link.                                                                                                                                                                      |
| CRAWLER_FULL_PAGE_SCREENSHOT             | No       | false     | Whether to store a screenshot of the full page or not. Disabled by default, as it can lead to much higher disk usage. If disabled, the screenshot will only include the visible part of the page                                                                                                                                                                              |
| CRAWLER_SCREENSHOT_TIMEOUT_SEC           | No       | 5         | How long to wait for the screenshot finish before timing out. If you are capturing full-page screenshots of long webpages, consider increasing this value.                                                                                                                                                                                                                    |
| CRAWLER_FULL_PAGE_ARCHIVE                | No       | false     | Whether to store a full local copy of the page or not. Disabled by default, as it can lead to much higher disk usage. If disabled, only the readable text of the page is archived.                                                                                                                                                                                            |
| CRAWLER_JOB_TIMEOUT_SEC                  | No       | 60        | How long to wait for the crawler job to finish before timing out. If you have a slow internet connection or a low powered device, you might want to bump this up a bit                                                                                                                                                                                                        |
| CRAWLER_NAVIGATE_TIMEOUT_SEC             | No       | 30        | How long to spend navigating to the page (along with its redirects). Increase this if you have a slow internet connection                                                                                                                                                                                                                                                     |
| CRAWLER_VIDEO_DOWNLOAD                   | No       | false     | Whether to download videos from the page or not (using yt-dlp)                                                                                                                                                                                                                                                                                                                |
| CRAWLER_VIDEO_DOWNLOAD_MAX_SIZE          | No       | 50        | The maximum file size for the downloaded video. The quality will be chosen accordingly. Use -1 to disable the limit.                                                                                                                                                                                                                                                          |
| CRAWLER_VIDEO_DOWNLOAD_TIMEOUT_SEC       | No       | 600       | How long to wait for the video download to finish                                                                                                                                                                                                                                                                                                                             |
| CRAWLER_ENABLE_ADBLOCKER                 | No       | true      | Whether to enable an adblocker in the crawler or not. If you're facing troubles downloading the adblocking lists on worker startup, you can disable this.                                                                                                                                                                                                                     |
| CRAWLER_WAYBACK_FALLBACK                 | No       | true      | Fetch the latest Wayback Machine snapshot when crawling fails.                                                                                                                                                                                                                                                                                                                |
| CRAWLER_YTDLP_ARGS                       | No       | []        | Include additional yt-dlp arguments to be passed at crawl time separated by %%: https://github.com/yt-dlp/yt-dlp?tab=readme-ov-file#general-options                                                                                                                                                                                                                           |
| BROWSER_COOKIE_PATH                      | No       | Not set   | Path to a JSON file containing cookies to be loaded into the browser context. The file should be an array of cookie objects, each with name and value (required), and optional fields like domain, path, expires, httpOnly, secure, and sameSite (e.g., `[{"name": "session", "value": "xxx", "domain": ".example.com"}`]).                                                   |
| HTML_CONTENT_SIZE_INLINE_THRESHOLD_BYTES | No       | 5 * 1024 | The thresholds in bytes after which larger assets will be stored in the assetdb (folder/s3) instead of inline in the database.                                                                                                                                                                                                                                                |

<details>

  <summary>More info on BROWSER_COOKIE_PATH</summary>

BROWSER_COOKIE_PATH specifies the path to a JSON file containing cookies to be loaded into the browser context for crawling.

The JSON file must be an array of cookie objects, each with:

- name: The cookie name (required).
- value: The cookie value (required).
- Optional fields: domain, path, expires, httpOnly, secure, sameSite (values: "Strict", "Lax", or "None").

Example JSON file:

```json
[
  {
    "name": "session",
    "value": "xxx",
    "domain": ".example.com",
    "path": "/",
    "expires": 1735689600,
    "httpOnly": true,
    "secure": true,
    "sameSite": "Lax"
  }
]
```

</details>

## OCR Configs

Karakeep uses [tesseract.js](https://github.com/naptha/tesseract.js) to extract text from images.

| Name                     | Required | Default   | Description                                                                                                                                                                                                                               |
| ------------------------ | -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR_CACHE_DIR            | No       | $TEMP_DIR | The dir where tesseract will download its models. By default, those models are not persisted and stored in the OS' temp dir.                                                                                                              |
| OCR_LANGS                | No       | eng       | Comma separated list of the language codes that you want tesseract to support. You can find the language codes [here](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html). Set to empty string to disable OCR. |
| OCR_CONFIDENCE_THRESHOLD | No       | 50        | A number between 0 and 100 indicating the minimum acceptable confidence from tessaract. If tessaract's confidence is lower than this value, extracted text won't be stored.                                                               |

## Webhook Configs

You can use webhooks to trigger actions when bookmarks are created, changed or crawled.

| Name                | Required | Default | Description                                       |
| ------------------- | -------- | ------- | ------------------------------------------------- |
| WEBHOOK_TIMEOUT_SEC | No       | 5       | The timeout for the webhook request in seconds.   |
| WEBHOOK_RETRY_TIMES | No       | 3       | The number of times to retry the webhook request. |

:::info

- The WEBHOOK_TOKEN is used for authentication. It will appear in the Authorization header as Bearer token.
  ```
  Authorization: Bearer <WEBHOOK_TOKEN>
  ```
- The webhook will be triggered with the job id (used for idempotence), bookmark id, bookmark type, the user id, the url and the operation in JSON format in the body.

  ```json
  {
    "jobId": "123",
    "type": "link",
    "bookmarkId": "exampleBookmarkId",
    "userId": "exampleUserId",
    "url": "https://example.com",
    "operation": "crawled"
  }
  ```

  :::

## SMTP Configuration

Karakeep can send emails for various purposes such as email verification during signup. Configure these settings to enable email functionality.

| Name          | Required | Default | Description                                                                                     |
| ------------- | -------- | ------- | ----------------------------------------------------------------------------------------------- |
| SMTP_HOST     | No       | Not set | The SMTP server hostname or IP address. Required if you want to enable email functionality.     |
| SMTP_PORT     | No       | 587     | The SMTP server port. Common values are 587 (STARTTLS), 465 (SSL/TLS), or 25 (unencrypted).     |
| SMTP_SECURE   | No       | false   | Whether to use SSL/TLS encryption. Set to true for port 465, false for port 587 with STARTTLS.  |
| SMTP_USER     | No       | Not set | The username for SMTP authentication. Usually your email address.                               |
| SMTP_PASSWORD | No       | Not set | The password for SMTP authentication. For services like Gmail, use an app-specific password.    |
| SMTP_FROM     | No       | Not set | The "from" email address that will appear in sent emails. This should be a valid email address. |

## Proxy Configuration

If your Karakeep instance needs to connect through a proxy server, you can configure the following settings:

| Name                               | Required | Default | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRAWLER_HTTP_PROXY                 | No       | Not set | HTTP proxy server URL for outgoing HTTP requests (e.g., `http://proxy.example.com:8080`). You can pass multiple comma separated proxies and the used one will be chosen at random. The proxy is used for crawling, RSS feed fetches and webhooks.                                                                                                                                                                                                                                       |
| CRAWLER_HTTPS_PROXY                | No       | Not set | HTTPS proxy server URL for outgoing HTTPS requests (e.g., `http://proxy.example.com:8080`). You can pass multiple comma separated proxies and the used one will be chosen at random. The proxy is used for crawling, RSS feed fetches and webhooks.                                                                                                                                                                                                                                     |
| CRAWLER_NO_PROXY                   | No       | Not set | Comma-separated list of hostnames/IPs that should bypass the proxy (e.g., `localhost,127.0.0.1,.local`)                                                                                                                                                                                                                                                                                                                                                                                 |
| CRAWLER_ALLOWED_INTERNAL_HOSTNAMES | No       | Not set | By default, Karakeep blocks worker-initiated requests whose DNS resolves to private, loopback, or link-local IP addresses. Use this to allowlist specific hostnames for internal access (e.g., `internal.company.com,.local`). Supports domain wildcards by prefixing with a dot (e.g., `.internal.company.com`). Note: Internal IP validation is bypassed when a proxy is configured for the URL as the local DNS resolver won't necessarily be the same as the one used by the proxy. |

:::info
These proxy settings will be used by the crawler and other components that make outgoing HTTP requests.
:::
