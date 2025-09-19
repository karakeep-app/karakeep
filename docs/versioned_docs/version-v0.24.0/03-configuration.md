# Configuration

The app is mainly configured by environment variables. All the used environment variables are listed in [packages/shared/config.ts](https://github.com/karakeep-app/karakeep/blob/main/packages/shared/config.ts). The most important ones are:

| Name                      | Required                              | Default | Description                                                                                                                                    |
| ------------------------- | ------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| DATA_DIR                  | Yes                                   | Not set | The path for the persistent data directory. This is where the db lives. Assets are stored here by default unless `ASSETS_DIR` is set.          |
| ASSETS_DIR                | No                                    | Not set | The path where crawled assets will be stored. If not set, defaults to `${DATA_DIR}/assets`.                                                    |
| NEXTAUTH_URL              | Yes                                   | Not set | Should point to the address of your server. The app will function without it, but will redirect you to wrong addresses on signout for example. |
| NEXTAUTH_SECRET           | Yes                                   | Not set | Random string used to sign the JWT tokens. Generate one with `openssl rand -base64 36`.                                                        |
| MEILI_ADDR                | No                                    | Not set | The address of meilisearch. If not set, Search will be disabled. E.g. (`http://meilisearch:7700`)                                              |
| MEILI_MASTER_KEY          | Only in Prod and if search is enabled | Not set | The master key configured for meilisearch. Not needed in development environment. Generate one with `openssl rand -base64 36 \| tr -dc 'A-Za-z0-9'`                   |
| MAX_ASSET_SIZE_MB         | No                                    | 50      | Sets the maximum allowed asset size (in MB) to be uploaded                                                                                     |
| DISABLE_NEW_RELEASE_CHECK | No                                    | false   | If set to true, latest release check will be disabled in the admin panel.                                                                      |

## Authentication / Signup

By default, Karakeep uses the database to store users, but it is possible to also use OAuth.
The flags need to be provided to the `web` container.

:::info
Only OIDC compliant OAuth providers are supported! For information on how to set it up, consult the documentation of your provider.
:::

:::info
When setting up OAuth, the allowed redirect URLs configured at the provider should be set to `<KARAKEEP_ADDRESS>/api/auth/callback/custom` where `<KARAKEEP_ADDRESS>` is the address you configured in `NEXTAUTH_URL` (for example: `https://try.karakeep.app/api/auth/callback/custom`).
:::

| Name                                        | Required | Default                | Description                                                                                                                                                         |
| ------------------------------------------- | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DISABLE_SIGNUPS                             | No       | false                  | If enabled, no new signups will be allowed and the signup button will be disabled in the UI                                                                         |
| DISABLE_PASSWORD_AUTH                       | No       | false                  | If enabled, only signups and logins using OAuth are allowed and the signup button and login form for local accounts will be disabled in the UI                      |
| OAUTH_WELLKNOWN_URL                         | No       | Not set                | The "wellknown Url" for openid-configuration as provided by the OAuth provider                                                                                      |
| OAUTH_CLIENT_SECRET                         | No       | Not set                | The "Client Secret" as provided by the OAuth provider                                                                                                               |
| OAUTH_CLIENT_ID                             | No       | Not set                | The "Client ID" as provided by the OAuth provider                                                                                                                   |
| OAUTH_SCOPE                                 | No       | "openid email profile" | "Full list of scopes to request (space delimited)"                                                                                                                  |
| OAUTH_PROVIDER_NAME                         | No       | "Custom Provider"      | The name of your provider. Will be shown on the signup page as "Sign in with `<name>`"                                                                              |
| OAUTH_ALLOW_DANGEROUS_EMAIL_ACCOUNT_LINKING | No       | false                  | Whether existing accounts in karakeep stored in the database should automatically be linked with your OAuth account. Only enable it if you trust the OAuth provider! |
| OAUTH_TIMEOUT                               | No       | 3500                   | The wait time in milliseconds for the OAuth provider response. Increase this if you are having `outgoing request timed out` errors                                  |

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
| INFERENCE_LANG                       | No       | english                | The language in which the tags will be generated.                                                                                                                                                                                                                                                                                                                                     |
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
