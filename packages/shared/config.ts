import crypto from "node:crypto";
import path from "path";
import { z } from "zod";

const stringBool = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .refine((s) => s === "true" || s === "false")
    .transform((s) => s === "true");

const optionalStringBool = () =>
  z
    .string()
    .refine((s) => s === "true" || s === "false")
    .transform((s) => s === "true")
    .optional();

const allEnv = z.object({
  PORT: z.coerce.number().default(3000),
  WORKERS_HOST: z.string().default("127.0.0.1"),
  WORKERS_PORT: z.coerce.number().default(0),
  WORKERS_ENABLED_WORKERS: z
    .string()
    .default("")
    .transform((val) =>
      val
        .split(",")
        .map((w) => w.trim())
        .filter((w) => w),
    ),
  WORKERS_DISABLED_WORKERS: z
    .string()
    .default("")
    .transform((val) =>
      val
        .split(",")
        .map((w) => w.trim())
        .filter((w) => w),
    ),
  API_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    .transform((s) => s.replace(/\/+$/, "")),
  NEXTAUTH_SECRET: z.string().optional(),
  DISABLE_SIGNUPS: stringBool("false"),
  DISABLE_PASSWORD_AUTH: stringBool("false"),
  OAUTH_ALLOW_DANGEROUS_EMAIL_ACCOUNT_LINKING: stringBool("false"),
  OAUTH_WELLKNOWN_URL: z.string().url().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_TIMEOUT: z.coerce.number().optional().default(3500),
  OAUTH_SCOPE: z.string().default("openid email profile"),
  OAUTH_PROVIDER_NAME: z.string().default("Custom Provider"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_KEEP_ALIVE: z.string().optional(),
  INFERENCE_JOB_TIMEOUT_SEC: z.coerce.number().default(30),
  INFERENCE_FETCH_TIMEOUT_SEC: z.coerce.number().default(300),
  INFERENCE_TEXT_MODEL: z.string().default("gpt-4.1-mini"),
  INFERENCE_IMAGE_MODEL: z.string().default("gpt-4o-mini"),
  EMBEDDING_TEXT_MODEL: z.string().default("text-embedding-3-small"),
  INFERENCE_CONTEXT_LENGTH: z.coerce.number().default(2048),
  INFERENCE_MAX_OUTPUT_TOKENS: z.coerce.number().default(2048),
  INFERENCE_SUPPORTS_STRUCTURED_OUTPUT: optionalStringBool(),
  INFERENCE_OUTPUT_SCHEMA: z
    .enum(["structured", "json", "plain"])
    .default("structured"),
  INFERENCE_ENABLE_AUTO_TAGGING: stringBool("true"),
  INFERENCE_ENABLE_AUTO_SUMMARIZATION: stringBool("false"),
  OCR_CACHE_DIR: z.string().optional(),
  OCR_LANGS: z
    .string()
    .default("eng")
    .transform((val) => val.split(",")),
  OCR_CONFIDENCE_THRESHOLD: z.coerce.number().default(50),
  CRAWLER_HEADLESS_BROWSER: stringBool("true"),
  BROWSER_WEB_URL: z.string().optional(),
  BROWSER_WEBSOCKET_URL: z.string().optional(),
  BROWSER_CONNECT_ONDEMAND: stringBool("false"),
  BROWSER_COOKIE_PATH: z.string().optional(),
  CRAWLER_JOB_TIMEOUT_SEC: z.coerce.number().default(60),
  CRAWLER_NAVIGATE_TIMEOUT_SEC: z.coerce.number().default(30),
  CRAWLER_NUM_WORKERS: z.coerce.number().default(1),
  INFERENCE_NUM_WORKERS: z.coerce.number().default(1),
  SEARCH_NUM_WORKERS: z.coerce.number().default(1),
  WEBHOOK_NUM_WORKERS: z.coerce.number().default(1),
  ASSET_PREPROCESSING_NUM_WORKERS: z.coerce.number().default(1),
  RULE_ENGINE_NUM_WORKERS: z.coerce.number().default(1),
  CRAWLER_DOWNLOAD_BANNER_IMAGE: stringBool("true"),
  CRAWLER_STORE_SCREENSHOT: stringBool("true"),
  CRAWLER_FULL_PAGE_SCREENSHOT: stringBool("false"),
  CRAWLER_FULL_PAGE_ARCHIVE: stringBool("false"),
  CRAWLER_VIDEO_DOWNLOAD: stringBool("false"),
  CRAWLER_VIDEO_DOWNLOAD_MAX_SIZE: z.coerce.number().default(50),
  CRAWLER_VIDEO_DOWNLOAD_TIMEOUT_SEC: z.coerce.number().default(10 * 60),
  CRAWLER_ENABLE_ADBLOCKER: stringBool("true"),
  CRAWLER_YTDLP_ARGS: z
    .string()
    .default("")
    .transform((t) => t.split("%%").filter((a) => a)),
  CRAWLER_SCREENSHOT_TIMEOUT_SEC: z.coerce.number().default(5),
  LOG_LEVEL: z.string().default("debug"),
  NO_COLOR: stringBool("false"),
  DEMO_MODE: stringBool("false"),
  DEMO_MODE_EMAIL: z.string().optional(),
  DEMO_MODE_PASSWORD: z.string().optional(),
  DATA_DIR: z.string().default(""),
  ASSETS_DIR: z.string().optional(),
  MAX_ASSET_SIZE_MB: z.coerce.number().default(50),
  INFERENCE_LANG: z.string().default("english"),
  WEBHOOK_TIMEOUT_SEC: z.coerce.number().default(5),
  WEBHOOK_RETRY_TIMES: z.coerce.number().int().min(0).default(3),
  // Build only flag
  SERVER_VERSION: z.string().optional(),
  DISABLE_NEW_RELEASE_CHECK: stringBool("false"),

  // A flag to detect if the user is running in the old separete containers setup
  USING_LEGACY_SEPARATE_CONTAINERS: stringBool("false"),

  // Prometheus metrics configuration
  PROMETHEUS_AUTH_TOKEN: z.string().optional(),

  // Email configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_SECURE: stringBool("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  EMAIL_VERIFICATION_REQUIRED: stringBool("false"),

  // Asset storage configuration
  ASSET_STORE_S3_ENDPOINT: z.string().optional(),
  ASSET_STORE_S3_REGION: z.string().optional(),
  ASSET_STORE_S3_BUCKET: z.string().optional(),
  ASSET_STORE_S3_ACCESS_KEY_ID: z.string().optional(),
  ASSET_STORE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  ASSET_STORE_S3_FORCE_PATH_STYLE: stringBool("false"),

  // Rate limiting configuration
  RATE_LIMITING_ENABLED: stringBool("false"),

  // Stripe configuration
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),

  FREE_QUOTA_BOOKMARK_LIMIT: z.coerce.number().optional(),
  FREE_QUOTA_ASSET_SIZE_BYTES: z.coerce.number().optional(),
  FREE_BROWSER_CRAWLING_ENABLED: optionalStringBool(),
  PAID_QUOTA_BOOKMARK_LIMIT: z.coerce.number().optional(),
  PAID_QUOTA_ASSET_SIZE_BYTES: z.coerce.number().optional(),
  PAID_BROWSER_CRAWLING_ENABLED: optionalStringBool(),

  // Proxy configuration
  CRAWLER_HTTP_PROXY: z
    .string()
    .transform((val) =>
      val
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p),
    )
    .optional(),
  CRAWLER_HTTPS_PROXY: z
    .string()
    .transform((val) =>
      val
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p),
    )
    .optional(),
  CRAWLER_NO_PROXY: z.string().optional(),

  // Database configuration
  DB_WAL_MODE: stringBool("false"),
});

const serverConfigSchema = allEnv.transform((val, ctx) => {
  const obj = {
    port: val.PORT,
    workers: {
      host: val.WORKERS_HOST,
      port: val.WORKERS_PORT,
      enabledWorkers: val.WORKERS_ENABLED_WORKERS,
      disabledWorkers: val.WORKERS_DISABLED_WORKERS,
    },
    apiUrl: val.API_URL,
    publicUrl: val.NEXTAUTH_URL,
    publicApiUrl: `${val.NEXTAUTH_URL}/api`,
    signingSecret: () => {
      if (!val.NEXTAUTH_SECRET) {
        throw new Error("NEXTAUTH_SECRET is not set");
      }
      return val.NEXTAUTH_SECRET;
    },
    auth: {
      disableSignups: val.DISABLE_SIGNUPS,
      disablePasswordAuth: val.DISABLE_PASSWORD_AUTH,
      emailVerificationRequired: val.EMAIL_VERIFICATION_REQUIRED,
      oauth: {
        allowDangerousEmailAccountLinking:
          val.OAUTH_ALLOW_DANGEROUS_EMAIL_ACCOUNT_LINKING,
        wellKnownUrl: val.OAUTH_WELLKNOWN_URL,
        clientSecret: val.OAUTH_CLIENT_SECRET,
        clientId: val.OAUTH_CLIENT_ID,
        scope: val.OAUTH_SCOPE,
        name: val.OAUTH_PROVIDER_NAME,
        timeout: val.OAUTH_TIMEOUT,
      },
    },
    email: {
      smtp: val.SMTP_HOST
        ? {
            host: val.SMTP_HOST,
            port: val.SMTP_PORT,
            secure: val.SMTP_SECURE,
            user: val.SMTP_USER,
            password: val.SMTP_PASSWORD,
            from: val.SMTP_FROM,
          }
        : undefined,
    },
    inference: {
      isConfigured: !!val.OPENAI_API_KEY || !!val.OLLAMA_BASE_URL,
      numWorkers: val.INFERENCE_NUM_WORKERS,
      jobTimeoutSec: val.INFERENCE_JOB_TIMEOUT_SEC,
      fetchTimeoutSec: val.INFERENCE_FETCH_TIMEOUT_SEC,
      openAIApiKey: val.OPENAI_API_KEY,
      openAIBaseUrl: val.OPENAI_BASE_URL,
      ollamaBaseUrl: val.OLLAMA_BASE_URL,
      ollamaKeepAlive: val.OLLAMA_KEEP_ALIVE,
      textModel: val.INFERENCE_TEXT_MODEL,
      imageModel: val.INFERENCE_IMAGE_MODEL,
      inferredTagLang: val.INFERENCE_LANG,
      contextLength: val.INFERENCE_CONTEXT_LENGTH,
      maxOutputTokens: val.INFERENCE_MAX_OUTPUT_TOKENS,
      outputSchema:
        val.INFERENCE_SUPPORTS_STRUCTURED_OUTPUT !== undefined
          ? val.INFERENCE_SUPPORTS_STRUCTURED_OUTPUT
            ? ("structured" as const)
            : ("plain" as const)
          : val.INFERENCE_OUTPUT_SCHEMA,
      enableAutoTagging: val.INFERENCE_ENABLE_AUTO_TAGGING,
      enableAutoSummarization: val.INFERENCE_ENABLE_AUTO_SUMMARIZATION,
    },
    embedding: {
      textModel: val.EMBEDDING_TEXT_MODEL,
    },
    crawler: {
      numWorkers: val.CRAWLER_NUM_WORKERS,
      headlessBrowser: val.CRAWLER_HEADLESS_BROWSER,
      browserWebUrl: val.BROWSER_WEB_URL,
      browserWebSocketUrl: val.BROWSER_WEBSOCKET_URL,
      browserConnectOnDemand: val.BROWSER_CONNECT_ONDEMAND,
      browserCookiePath: val.BROWSER_COOKIE_PATH,
      jobTimeoutSec: val.CRAWLER_JOB_TIMEOUT_SEC,
      navigateTimeoutSec: val.CRAWLER_NAVIGATE_TIMEOUT_SEC,
      downloadBannerImage: val.CRAWLER_DOWNLOAD_BANNER_IMAGE,
      storeScreenshot: val.CRAWLER_STORE_SCREENSHOT,
      fullPageScreenshot: val.CRAWLER_FULL_PAGE_SCREENSHOT,
      fullPageArchive: val.CRAWLER_FULL_PAGE_ARCHIVE,
      downloadVideo: val.CRAWLER_VIDEO_DOWNLOAD,
      maxVideoDownloadSize: val.CRAWLER_VIDEO_DOWNLOAD_MAX_SIZE,
      downloadVideoTimeout: val.CRAWLER_VIDEO_DOWNLOAD_TIMEOUT_SEC,
      enableAdblocker: val.CRAWLER_ENABLE_ADBLOCKER,
      ytDlpArguments: val.CRAWLER_YTDLP_ARGS,
      screenshotTimeoutSec: val.CRAWLER_SCREENSHOT_TIMEOUT_SEC,
    },
    ocr: {
      langs: val.OCR_LANGS,
      cacheDir: val.OCR_CACHE_DIR,
      confidenceThreshold: val.OCR_CONFIDENCE_THRESHOLD,
    },
    search: {
      numWorkers: val.SEARCH_NUM_WORKERS,
    },
    logLevel: val.LOG_LEVEL,
    logNoColor: val.NO_COLOR,
    demoMode: val.DEMO_MODE
      ? {
          email: val.DEMO_MODE_EMAIL,
          password: val.DEMO_MODE_PASSWORD,
        }
      : undefined,
    dataDir: val.DATA_DIR,
    assetsDir: val.ASSETS_DIR ?? path.join(val.DATA_DIR, "assets"),
    maxAssetSizeMb: val.MAX_ASSET_SIZE_MB,
    serverVersion: val.SERVER_VERSION,
    disableNewReleaseCheck: val.DISABLE_NEW_RELEASE_CHECK,
    usingLegacySeparateContainers: val.USING_LEGACY_SEPARATE_CONTAINERS,
    webhook: {
      timeoutSec: val.WEBHOOK_TIMEOUT_SEC,
      retryTimes: val.WEBHOOK_RETRY_TIMES,
      numWorkers: val.WEBHOOK_NUM_WORKERS,
    },
    proxy: {
      httpProxy: val.CRAWLER_HTTP_PROXY,
      httpsProxy: val.CRAWLER_HTTPS_PROXY,
      noProxy: val.CRAWLER_NO_PROXY,
    },
    assetPreprocessing: {
      numWorkers: val.ASSET_PREPROCESSING_NUM_WORKERS,
    },
    ruleEngine: {
      numWorkers: val.RULE_ENGINE_NUM_WORKERS,
    },
    assetStore: {
      type: val.ASSET_STORE_S3_ENDPOINT
        ? ("s3" as const)
        : ("filesystem" as const),
      s3: {
        endpoint: val.ASSET_STORE_S3_ENDPOINT,
        region: val.ASSET_STORE_S3_REGION,
        bucket: val.ASSET_STORE_S3_BUCKET,
        accessKeyId: val.ASSET_STORE_S3_ACCESS_KEY_ID,
        secretAccessKey: val.ASSET_STORE_S3_SECRET_ACCESS_KEY,
        forcePathStyle: val.ASSET_STORE_S3_FORCE_PATH_STYLE,
      },
    },
    prometheus: {
      metricsToken:
        val.PROMETHEUS_AUTH_TOKEN ?? crypto.randomBytes(64).toString("hex"),
    },
    rateLimiting: {
      enabled: val.RATE_LIMITING_ENABLED,
    },
    stripe: {
      secretKey: val.STRIPE_SECRET_KEY,
      publishableKey: val.STRIPE_PUBLISHABLE_KEY,
      webhookSecret: val.STRIPE_WEBHOOK_SECRET,
      priceId: val.STRIPE_PRICE_ID,
      isConfigured: !!val.STRIPE_SECRET_KEY && !!val.STRIPE_PUBLISHABLE_KEY,
    },
    quotas: {
      free: {
        bookmarkLimit: val.FREE_QUOTA_BOOKMARK_LIMIT ?? null,
        assetSizeBytes: val.FREE_QUOTA_ASSET_SIZE_BYTES ?? null,
        browserCrawlingEnabled: val.FREE_BROWSER_CRAWLING_ENABLED ?? null,
      },
      paid: {
        bookmarkLimit: val.PAID_QUOTA_BOOKMARK_LIMIT ?? null,
        assetSizeBytes: val.PAID_QUOTA_ASSET_SIZE_BYTES ?? null,
        browserCrawlingEnabled: val.PAID_BROWSER_CRAWLING_ENABLED ?? null,
      },
    },
    database: {
      walMode: val.DB_WAL_MODE,
    },
  };
  if (obj.auth.emailVerificationRequired && !obj.email.smtp) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "To enable email verification, SMTP settings must be configured",
      fatal: true,
    });
    return z.NEVER;
  }
  return obj;
});

const serverConfig = serverConfigSchema.parse(process.env);
// Always explicitly pick up stuff from server config to avoid accidentally leaking stuff
export const clientConfig = {
  publicUrl: serverConfig.publicUrl,
  publicApiUrl: serverConfig.publicApiUrl,
  demoMode: serverConfig.demoMode,
  auth: {
    disableSignups: serverConfig.auth.disableSignups,
    disablePasswordAuth: serverConfig.auth.disablePasswordAuth,
  },
  inference: {
    isConfigured: serverConfig.inference.isConfigured,
    inferredTagLang: serverConfig.inference.inferredTagLang,
  },
  serverVersion: serverConfig.serverVersion,
  disableNewReleaseCheck: serverConfig.disableNewReleaseCheck,
};
export type ClientConfig = typeof clientConfig;

export default serverConfig;
