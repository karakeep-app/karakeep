# Configuration

The app is mainly configured by environment variables. All the used environment variables are listed in [packages/shared/config.ts](https://github.com/karakeep-app/karakeep/blob/main/packages/shared/config.ts). The most important ones are:

| Name                            | Required                              | Default         | Description                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT                            | No                                    | 3000            | The port on which the web server will listen. DON'T CHANGE THIS IF YOU'RE USING DOCKER, instead changed the docker bound external port.                                                                                                                                                                                 |
| WORKERS_PORT                    | No                                    | 0 (Random Port) | The port on which the worker will export its prometheus metrics on `/metrics`. By default it's a random unused port. If you want to utilize those metrics, fix the port to a value (and export it in docker if you're using docker).                                                                                    |
| WORKERS_HOST                    | No                                    | 127.0.0.1       | Host to listen to for requests to WORKERS_PORT. You will need to set this if running in a container, since localhost will not be reachable from outside                                                                                                                                                                 |
| WORKERS_ENABLED_WORKERS         | No                                    | Not set         | Comma separated list of worker names to enable. If set, only these workers will run. Valid values: crawler,inference,search,tidyAssets,video,feed,assetPreprocessing,webhook,ruleEngine.                                                                                                                                |
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
| SEARCH_NUM_WORKERS              | No                                    | 1               | Number of concurrent workers for search indexing tasks. Increase this if you have a high volume of content being indexed for search.                                                                                                                                                                                    |
| WEBHOOK_NUM_WORKERS             | No                                    | 1               | Number of concurrent workers for webhook delivery. Increase this if you have multiple webhook endpoints or high webhook traffic.                                                                                                                                                                                        |
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

:::info
When using S3 storage, make sure the bucket exists and the provided credentials have the necessary permissions to read, write, and delete objects in the bucket.
:::

:::warning
Switching between storage backends after data has been stored will require manual migration of existing assets. Plan your storage backend choice carefully before deploying.
:::

## Authentication / Signup

By default, Karakeep uses the database to store users, but it is possible to also use OAuth.
The flags need to be provided to the `web` container.

:::info
Only OIDC compliant OAuth providers are supported! For information on how to set it up, consult the documentation of your provider.
:::

:::info
When setting up OAuth, the allowed redirect URLs configured at the provider should be set to `<KARAKEEP_ADDRESS>/api/auth/callback/custom` where `<KARAKEEP_ADDRESS>` is the address you configured in `NEXTAUTH_URL` (for example: `https://try.karakeep.app/api/auth/callback/custom`).
:::

| Name                                        | Required | Default                | Description                                                                                                                                                                                           |
| ------------------------------------------- | -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DISABLE_SIGNUPS                             | No       | false                  | If enabled, no new signups will be allowed and the signup button will be disabled in the UI                                                                                                           |
| DISABLE_PASSWORD_AUTH                       | No       | false                  | If enabled, only signups and logins using OAuth are allowed and the signup button and login form for local accounts will be disabled in the UI                                                        |
| EMAIL_VERIFICATION_REQUIRED                 | No       | false                  | Whether email verification is required during user signup. If enabled, users must verify their email address before they can use their account. If you enable this, you must configure SMTP settings. |
| OAUTH_WELLKNOWN_URL                         | No       | Not set                | The "wellknown Url" for openid-configuration as provided by the OAuth provider                                                                                                                        |
| OAUTH_CLIENT_SECRET                         | No       | Not set                | The "Client Secret" as provided by the OAuth provider                                                                                                                                                 |
| OAUTH_CLIENT_ID                             | No       | Not set                | The "Client ID" as provided by the OAuth provider                                                                                                                                                     |
| OAUTH_SCOPE                                 | No       | "openid email profile" | "Full list of scopes to request (space delimited)"                                                                                                                                                    |
| OAUTH_PROVIDER_NAME                         | No       | "Custom Provider"      | The name of your provider. Will be shown on the signup page as "Sign in with `<name>`"                                                                                                                |
| OAUTH_ALLOW_DANGEROUS_EMAIL_ACCOUNT_LINKING | No       | false                  | Whether existing accounts in karakeep stored in the database should automatically be linked with your OAuth account. Only enable it if you trust the OAuth provider!                                  |
| OAUTH_TIMEOUT                               | No       | 3500                   | The wait time in milliseconds for the OAuth provider response. Increase this if you are having `outgoing request timed out` errors                                                                    |

For more information on `OAUTH_ALLOW_DANGEROUS_EMAIL_ACCOUNT_LINKING`, check the [next-auth.js documentation](https://next-auth.js.org/configuration/providers/oauth#allowdangerousemailaccountlinking-option).

## Inference Configs (For automatic tagging)

Either `OPENAI_API_KEY` or `OLLAMA_BASE_URL` need to be set for automatic tagging to be enabled. Otherwise, automatic tagging will be skipped.

:::warning

- The quality of the tags you'll get will depend on the quality of the model you choose.
- You might want to tune the `INFERENCE_CONTEXT_LENGTH` as the default is quite small. The larger the value, the better the quality of the tags, but the more expensive the inference will be (money-wise on OpenAI and resource-wise on ollama).
  :::

| Name                                 | Required | Default                | Description                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPENAI_API_KEY                       | No       | Not set                | The OpenAI key used for automatic tagging. More on that in [here](/openai).                                                                                                                                                                                                                                                                                                           |
| OPENAI_BASE_URL                      | No       | Not set                | If you just want to use OpenAI you don't need to pass this variable. If, however, you want to use some other openai compatible API (e.g. azure openai service), set this to the url of the API.                                                                                                                                                                                       |
| OLLAMA_BASE_URL                      | No       | Not set                | If you want to use ollama for local inference, set the address of ollama API here.                                                                                                                                                                                                                                                                                                    |
| OLLAMA_KEEP_ALIVE                    | No       | Not set                | Controls how long the model will stay loaded into memory following the request (example value: "5m").                                                                                                                                                                                                                                                                                 |
| INFERENCE_TEXT_MODEL                 | No       | gpt-4.1-mini           | The model to use for text inference. You'll need to change this to some other model if you're using ollama.                                                                                                                                                                                                                                                                           |
| INFERENCE_IMAGE_MODEL                | No       | gpt-4o-mini            | The model to use for image inference. You'll need to change this to some other model if you're using ollama and that model needs to support vision APIs (e.g. llava).                                                                                                                                                                                                                 |
| EMBEDDING_TEXT_MODEL                 | No       | text-embedding-3-small | The model to be used for generating embeddings for the text.                                                                                                                                                                                                                                                                                                                          |
| INFERENCE_CONTEXT_LENGTH             | No       | 2048                   | The max number of tokens that we'll pass to the inference model. If your content is larger than this size, it'll be truncated to fit. The larger this value, the more of the content will be used in tag inference, but the more expensive the inference will be (money-wise on openAI and resource-wise on ollama). Check the model you're using for its max supported content size. |
| INFERENCE_MAX_OUTPUT_TOKENS          | No       | 2048                   | The maximum number of tokens that the inference model is allowed to generate in its response. This controls the length of AI-generated content like tags and summaries. Increase this if you need longer responses, but be aware that higher values will increase costs (for OpenAI) and processing time.                                                                             |
| INFERENCE_LANG                       | No       | english                | The language in which the tags will be generated.                                                                                                                                                                                                                                                                                                                                     |
| INFERENCE_NUM_WORKERS                | No       | 1                      | Number of concurrent workers for AI inference tasks (tagging and summarization). Increase this if you have multiple AI inference requests and want to process them in parallel.                                                                                                                                                                                                       |
| INFERENCE_ENABLE_AUTO_TAGGING        | No       | true                   | Whether automatic AI tagging is enabled or disabled.                                                                                                                                                                                                                                                                                                                                  |
| INFERENCE_ENABLE_AUTO_SUMMARIZATION  | No       | false                  | Whether automatic AI summarization is enabled or disabled.                                                                                                                                                                                                                                                                                                                            |
| INFERENCE_JOB_TIMEOUT_SEC            | No       | 30                     | How long to wait for the inference job to finish before timing out. If you're running ollama without powerful GPUs, you might want to increase the timeout a bit.                                                                                                                                                                                                                     |
| INFERENCE_FETCH_TIMEOUT_SEC          | No       | 300                    | \[Ollama Only\] The timeout of the fetch request to the ollama server. If your inference requests take longer than the default 5mins, you might want to increase this timeout.                                                                                                                                                                                                        |
| INFERENCE_SUPPORTS_STRUCTURED_OUTPUT | No       | Not set                | \[DEPRECATED\] Whether the inference model supports structured output or not. Use INFERENCE_OUTPUT_SCHEMA instead. Setting this to true translates to INFERENCE_OUTPUT_SCHEMA=structured, and to false translates to INFERENCE_OUTPUT_SCHEMA=plain.                                                                                                                                   |
| INFERENCE_OUTPUT_SCHEMA              | No       | structured             | Possible values are "structured", "json", "plain". Structured is the preferred option, but if your model doesn't support it, you can use "json" if your model supports JSON mode, otherwise "plain" which should be supported by all the models but the model might not output the data in the correct format.                                                                        |

:::info

- You can append additional instructions to the prompt used for automatic tagging, in the `AI Settings` (in the `User Settings` screen)
- You can use the placeholders `$tags`, `$aiTags`, `$userTags` in the prompt. These placeholders will be replaced with all tags, ai generated tags or human created tags when automatic tagging is performed (e.g. `[karakeep, computer, ai]`)
  :::

## Crawler Configs

| Name                               | Required | Default | Description                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRAWLER_NUM_WORKERS                | No       | 1       | Number of allowed concurrent crawling jobs. By default, we're only doing one crawling request at a time to avoid consuming a lot of resources.                                                                                                                                                                                                                                |
| BROWSER_WEB_URL                    | No       | Not set | The browser's http debugging address. The worker will talk to this endpoint to resolve the debugging console's websocket address. If you already have the websocket address, use `BROWSER_WEBSOCKET_URL` instead. If neither `BROWSER_WEB_URL` nor `BROWSER_WEBSOCKET_URL` are set, the worker will use plain http requests skipping screenshotting and javascript execution. |
| BROWSER_WEBSOCKET_URL              | No       | Not set | The websocket address of browser's debugging console. If you want to use [browserless](https://browserless.io), use their websocket address here. If neither `BROWSER_WEB_URL` nor `BROWSER_WEBSOCKET_URL` are set, the worker will use plain http requests skipping screenshotting and javascript execution.                                                                 |
| BROWSER_CONNECT_ONDEMAND           | No       | false   | If set to false, the crawler will proactively connect to the browser instance and always maintain an active connection. If set to true, the browser will be launched on demand only whenever a crawling is requested. Set to true if you're using a service that provides you with browser instances on demand.                                                               |
| CRAWLER_DOWNLOAD_BANNER_IMAGE      | No       | true    | Whether to cache the banner image used in the cards locally or fetch it each time directly from the website. Caching it consumes more storage space, but is more resilient against link rot and rate limits from websites.                                                                                                                                                    |
| CRAWLER_STORE_SCREENSHOT           | No       | true    | Whether to store a screenshot from the crawled website or not. Screenshots act as a fallback for when we fail to extract an image from a website. You can also view the stored screenshots for any link.                                                                                                                                                                      |
| CRAWLER_FULL_PAGE_SCREENSHOT       | No       | false   | Whether to store a screenshot of the full page or not. Disabled by default, as it can lead to much higher disk usage. If disabled, the screenshot will only include the visible part of the page                                                                                                                                                                              |
| CRAWLER_SCREENSHOT_TIMEOUT_SEC     | No       | 5       | How long to wait for the screenshot finish before timing out. If you are capturing full-page screenshots of long webpages, consider increasing this value.                                                                                                                                                                                                                    |
| CRAWLER_FULL_PAGE_ARCHIVE          | No       | false   | Whether to store a full local copy of the page or not. Disabled by default, as it can lead to much higher disk usage. If disabled, only the readable text of the page is archived.                                                                                                                                                                                            |
| CRAWLER_JOB_TIMEOUT_SEC            | No       | 60      | How long to wait for the crawler job to finish before timing out. If you have a slow internet connection or a low powered device, you might want to bump this up a bit                                                                                                                                                                                                        |
| CRAWLER_NAVIGATE_TIMEOUT_SEC       | No       | 30      | How long to spend navigating to the page (along with its redirects). Increase this if you have a slow internet connection                                                                                                                                                                                                                                                     |
| CRAWLER_VIDEO_DOWNLOAD             | No       | false   | Whether to download videos from the page or not (using yt-dlp)                                                                                                                                                                                                                                                                                                                |
| CRAWLER_VIDEO_DOWNLOAD_MAX_SIZE    | No       | 50      | The maximum file size for the downloaded video. The quality will be chosen accordingly. Use -1 to disable the limit.                                                                                                                                                                                                                                                          |
| CRAWLER_VIDEO_DOWNLOAD_TIMEOUT_SEC | No       | 600     | How long to wait for the video download to finish                                                                                                                                                                                                                                                                                                                             |
| CRAWLER_ENABLE_ADBLOCKER           | No       | true    | Whether to enable an adblocker in the crawler or not. If you're facing troubles downloading the adblocking lists on worker startup, you can disable this.                                                                                                                                                                                                                     |
| CRAWLER_YTDLP_ARGS                 | No       | []      | Include additional yt-dlp arguments to be passed at crawl time separated by %%: https://github.com/yt-dlp/yt-dlp?tab=readme-ov-file#general-options                                                                                                                                                                                                                           |
| BROWSER_COOKIE_PATH                | No       | Not set | Path to a JSON file containing cookies to be loaded into the browser context. The file should be an array of cookie objects, each with name and value (required), and optional fields like domain, path, expires, httpOnly, secure, and sameSite (e.g., `[{"name": "session", "value": "xxx", "domain": ".example.com"}`]).                                                   |

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

| Name                | Required | Default | Description                                                                                                                                                                           |
| ------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRAWLER_HTTP_PROXY  | No       | Not set | HTTP proxy server URL for outgoing HTTP requests (e.g., `http://proxy.example.com:8080`). You can pass multiple comma separated proxies and the used one will be chosen at random.   |
| CRAWLER_HTTPS_PROXY | No       | Not set | HTTPS proxy server URL for outgoing HTTPS requests (e.g., `http://proxy.example.com:8080`). You can pass multiple comma separated proxies and the used one will be chosen at random. |
| CRAWLER_NO_PROXY    | No       | Not set | Comma-separated list of hostnames/IPs that should bypass the proxy (e.g., `localhost,127.0.0.1,.local`)                                                                               |

:::info
These proxy settings will be used by the crawler and other components that make outgoing HTTP requests.
:::
