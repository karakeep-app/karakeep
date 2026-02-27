import { createHash, randomUUID } from "node:crypto";
import type { CheerioAPI } from "cheerio";
import type { Rules, RulesOptions } from "metascraper";
import { JSDOM } from "jsdom";
import { fetchWithProxy } from "network";
import { z } from "zod";

import logger from "@karakeep/shared/logger";

/**
 * Metascraper plugin for Bilibili URLs.
 *
 * References:
 * - https://github.com/Nemo2011/bilibili-api
 *
 * Open-source consensus followed in this implementation:
 * - Prefer public web APIs first, with graceful fallback chains.
 * - Keep bounded retries/backoff for anti-risk responses; do not spam endpoints.
 * - Keep parser behavior resilient to schema drift and partial payloads.
 * - Degrade safely (return undefined) so the generic extractor can take over.
 *
 * Scope for phase 1:
 * - video pages
 * - dynamic/opus pages
 * - article/column pages
 *
 * The plugin returns both metadata and reader-friendly HTML so Karakeep can
 * render content in the native Reader without introducing a custom frontend
 * renderer yet.
 *
 * Known limitations:
 * - Publicly accessible content only; login-required/private resources are not guaranteed.
 * - Dynamic endpoints may still hit higher risk controls under heavy repeated crawls.
 * - Desktop dynamic fallback payload is less structured and may lose some semantics.
 *
 * Planned next steps:
 * - Optional persistent site credential/device identity shared by crawler plugins.
 * - Better fallback title heuristics and richer dynamic card/body extraction.
 * - Phase 2 custom renderer path on top of this data layer.
 */
const BILIBILI_API_BASE = "https://api.bilibili.com";
const BILIBILI_LEGACY_API_BASE = "https://api.vc.bilibili.com";
const BILIBILI_PUBLISHER = "Bilibili";
const BILIBILI_FAVICON = "https://www.bilibili.com/favicon.ico";
// `desktop/v1/detail` currently expects this known desktop build marker.
const BILIBILI_DESKTOP_BUILD = "11605";
const BILIBILI_API_REQUEST_TIMEOUT_MS = 7000;
// Feature flags used by the opus/detail endpoint to expose richer modules.
const BILIBILI_DYNAMIC_OPUS_FEATURES =
  "itemOpusStyle,onlyfansVote,onlyfansAssetsV2,decorationCard,htmlNewStyle,ugcDelete,editable,opusPrivateVisible";
// Feature flags for `web-dynamic/v1/detail` fallback requests.
const BILIBILI_DYNAMIC_WEB_FEATURES =
  "itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete";
// `web_location` value commonly used by Bilibili web clients.
const BILIBILI_DYNAMIC_WEB_LOCATION = "333.1368";
// Serialized query payload for `x-bili-device-req-json`.
const BILIBILI_DYNAMIC_DEVICE_REQ_JSON = '{"platform":"web","device":"pc"}';
// Serialized query payload for `x-bili-web-req-json` (web request context).
const BILIBILI_DYNAMIC_WEB_REQ_JSON = '{"spm_id":"333.1368"}';
const BILIBILI_DEFAULT_VIDEO_TITLE = "Video - Bilibili";
const BILIBILI_DEFAULT_ARTICLE_TITLE = "Article - Bilibili";
const BILIBILI_DEFAULT_DYNAMIC_TITLE = "Dynamics - Bilibili";
const BILIBILI_DYNAMIC_FALLBACK_TITLE_TEXT_LIMIT = 38;

const BILIBILI_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  referer: "https://www.bilibili.com/",
} as const;

const METADATA_CACHE_TTL_MS = 60 * 1000;
const WBI_MIXIN_KEY_TTL_MS = 10 * 60 * 1000;
// Forwarded dynamic payloads can be deeply nested (`module_dynamic -> dyn_forward -> item -> modules ...`).
// Keep this bounded, but high enough to retain source text for multi-level forwards.
const DYNAMIC_COLLECT_MAX_DEPTH = 12;

const RETRYABLE_API_CODES = new Set([-352, -403]);
const DYNAMIC_STAT_LABELS = {
  repost: "转发 (Reposts)",
  comment: "评论 (Comments)",
  like: "点赞 (Likes)",
} as const;

const VIDEO_STAT_LABELS = {
  view: "播放 (Views)",
  danmaku: "弹幕 (Danmaku)",
  reply: "评论 (Comments)",
  like: "点赞 (Likes)",
  favorite: "收藏 (Favorites)",
  coin: "投币 (Coins)",
  share: "分享 (Shares)",
} as const;

const WBI_MIXIN_KEY_INDEX_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
] as const;

const apiEnvelopeSchema = z
  .object({
    code: z.number(),
    message: z.string().optional(),
    data: z.unknown().optional(),
    result: z.unknown().optional(),
  })
  .passthrough();

const navResponseSchema = z.object({
  code: z.number(),
  data: z.object({
    // `wbi_img` provides two rolling asset filenames used to derive mixin key.
    wbi_img: z.object({
      img_url: z.string(),
      sub_url: z.string(),
    }),
  }),
});

const seasonResponseSchema = z.object({
  code: z.number(),
  result: z
    .object({
      episodes: z
        .array(
          z.object({
            id: z.union([z.number(), z.string()]).optional(),
            ep_id: z.union([z.number(), z.string()]).optional(),
            aid: z.union([z.number(), z.string()]).optional(),
            bvid: z.string().optional(),
            pub_time: z.number().optional(),
            share_copy: z.string().optional(),
            title: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const videoViewResponseSchema = z.object({
  code: z.number(),
  data: z
    .object({
      aid: z.union([z.number(), z.string()]).optional(),
      bvid: z.string().optional(),
      title: z.string().optional(),
      desc: z.string().optional(),
      pic: z.string().optional(),
      pubdate: z.number().optional(),
      ctime: z.number().optional(),
      owner: z
        .object({
          name: z.string().optional(),
        })
        .optional(),
      stat: z
        .object({
          view: z.number().optional(),
          danmaku: z.number().optional(),
          reply: z.number().optional(),
          like: z.number().optional(),
          favorite: z.number().optional(),
          coin: z.number().optional(),
          share: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

const articleViewResponseSchema = z.object({
  code: z.number(),
  data: z
    .object({
      id: z.union([z.number(), z.string()]).optional(),
      title: z.string().optional(),
      summary: z.string().optional(),
      banner_url: z.string().optional(),
      image_urls: z.array(z.string()).optional(),
      author_name: z.string().optional(),
      author: z
        .object({
          name: z.string().optional(),
        })
        .optional(),
      publish_time: z.number().optional(),
      ctime: z.number().optional(),
      mtime: z.number().optional(),
      content: z.string().optional(),
    })
    .optional(),
});

const opusDetailResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z
    .object({
      fallback: z
        .object({
          id: z.union([z.string(), z.number()]).optional(),
          type: z.number().optional(),
        })
        .optional(),
      item: z
        .object({
          basic: z
            .object({
              comment_type: z.number().optional(),
              rid_str: z.union([z.string(), z.number()]).optional(),
              title: z.string().optional(),
            })
            .optional(),
          modules: z.array(z.record(z.unknown())).optional(),
          type: z.union([z.number(), z.string()]).optional(),
        })
        .optional(),
    })
    .optional(),
});

const legacyDynamicDetailResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z
    .object({
      card: z
        .object({
          desc: z
            .object({
              timestamp: z.number().optional(),
              repost: z.number().optional(),
              comment: z.number().optional(),
              like: z.number().optional(),
              user_profile: z
                .object({
                  info: z
                    .object({
                      uname: z.string().optional(),
                    })
                    .optional(),
                })
                .optional(),
            })
            .passthrough()
            .optional(),
          card: z.string().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
});

type ApiEnvelope = z.infer<typeof apiEnvelopeSchema>;
type OpusItem = NonNullable<
  NonNullable<z.infer<typeof opusDetailResponseSchema>["data"]>["item"]
>;

type BilibiliTarget =
  | {
      kind: "video";
      bvid?: string;
      aid?: string;
      epId?: string;
      seasonId?: string;
    }
  | {
      kind: "dynamic";
      dynamicId: string;
    }
  | {
      kind: "article";
      cvid: string;
    };

interface BilibiliMetadata {
  title?: string;
  description?: string;
  image?: string;
  author?: string;
  publisher?: string;
  datePublished?: string;
  dateModified?: string;
  readableContentHtml?: string;
  logo?: string;
}

interface CacheEntry {
  expiresAt: number;
  promise: Promise<BilibiliMetadata | undefined>;
}

interface WbiMixinKeyCache {
  key: string;
  expiresAt: number;
}

interface ApiRequestOptions {
  withWbi?: boolean;
  withWbi2?: boolean;
  useDesktopCookie?: boolean;
  retryAttempts?: number;
}

interface TextAndHtml {
  text: string;
  html: string;
}

interface OpusParseResult {
  title?: string;
  author?: string;
  datePublished?: string;
  description?: string;
  image?: string;
  bodyHtml: string;
  statsText?: string;
}

interface DesktopCard {
  title: string;
  url?: string;
  cover?: string;
  description?: string;
}

interface DesktopCollector {
  texts: string[];
  textSet: Set<string>;
  images: string[];
  imageSet: Set<string>;
  cards: DesktopCard[];
  cardSet: Set<string>;
}

interface DesktopParseResult {
  title?: string;
  author?: string;
  datePublished?: string;
  description?: string;
  image?: string;
  bodyHtml: string;
  statsText?: string;
}

// Promise-level metadata cache keyed by final URL.
// metascraper evaluates each rule field independently; without this cache we
// would repeat the same network requests for title/description/image/author/etc.
const metadataCache = new Map<string, CacheEntry>();

// WBI signing key cache shared by all requests in this worker process.
// When Bilibili returns risk responses (e.g. -403), the key is invalidated.
let wbiMixinKeyCache: WbiMixinKeyCache | undefined;

// Awaitable sleep helper used by retry backoff logic.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Bounded exponential backoff with jitter to avoid bursty retries.
function backoffDelay(attempt: number): number {
  const base = 250;
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(base * 2 ** attempt + jitter, 4000);
}

// Keep the in-memory cache bounded over long-running worker lifetime.
function purgeExpiredMetadataCache(now: number): void {
  for (const [key, entry] of metadataCache.entries()) {
    if (entry.expiresAt <= now) {
      metadataCache.delete(key);
    }
  }
}

// Convert numeric-like IDs from heterogeneous payload shapes into a stable
// decimal string format used by URL builders and API params.
function toNumericString(
  value: string | number | undefined,
): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

// Bilibili timestamps are usually seconds; normalize to ISO for Karakeep link
// metadata fields (`datePublished` / `dateModified`).
function toIsoDateFromSeconds(
  timestamp: number | undefined,
): string | undefined {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return undefined;
  }
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

// Normalize image URLs into absolute HTTPS links so they can be stored directly
// in bookmark metadata and rendered by Reader/mobile cards consistently.
function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("http://")) {
    return `https://${trimmed.slice("http://".length)}`;
  }

  return trimmed;
}

// Normalize link URLs for generated HTML; unlike image URLs we preserve `http`
// when explicitly provided to avoid rewriting third-party hosts unexpectedly.
function normalizeLinkUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return trimmed;
}

// Escape unsafe characters before embedding text into generated HTML.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Normalize and cap long text fields for metadata-friendly summaries.
function truncateText(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

// Strip site suffixes and normalize spacing in `<title>` / og:title strings.
function normalizeBilibiliPageTitle(
  rawTitle: string | undefined,
): string | undefined {
  if (!rawTitle) {
    return undefined;
  }

  let normalized = rawTitle.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  normalized = normalized
    .replace(/\s*[_-]\s*哔哩哔哩(?:\s*_bilibili)?$/i, "")
    .replace(/\s*\|\s*哔哩哔哩(?:\s*_bilibili)?$/i, "")
    .replace(/\s*-\s*哔哩哔哩(?:\s*_bilibili)?$/i, "")
    .trim();

  return normalized || undefined;
}

// Detect common captcha placeholder titles returned by risk pages.
function isCaptchaLikeTitle(title: string | undefined): boolean {
  if (!title) {
    return false;
  }
  return /^(验证码|verification code|captcha)$/i.test(title.trim());
}

// Detect whether the fetched HTML is a Bilibili risk/captcha challenge page.
function isBilibiliRiskCaptchaPage(htmlDom: CheerioAPI): boolean {
  const title = normalizeBilibiliPageTitle(htmlDom("title").first().text());
  if (isCaptchaLikeTitle(title)) {
    return true;
  }

  if (htmlDom("#risk-captcha-app").length > 0) {
    return true;
  }

  const htmlText = htmlDom("html").text();
  if (/window\._riskdata_|risk-captcha/i.test(htmlText)) {
    return true;
  }

  return false;
}

// Return generic fallback title by parsed target type when metadata is missing.
function getDefaultTitleForTarget(url: string): string | undefined {
  const target = parseBilibiliTarget(url);
  if (!target) {
    return undefined;
  }

  if (target.kind === "video") {
    return BILIBILI_DEFAULT_VIDEO_TITLE;
  }
  if (target.kind === "article") {
    return BILIBILI_DEFAULT_ARTICLE_TITLE;
  }
  return BILIBILI_DEFAULT_DYNAMIC_TITLE;
}

// Build dynamic fallback title when explicit post title is absent.
function buildDynamicFallbackTitle(
  author: string | undefined,
  description?: string,
): string {
  const normalizedAuthor = author?.trim();
  if (normalizedAuthor) {
    return `${normalizedAuthor}的动态 - 哔哩哔哩`;
  }

  const normalizedDescription = truncateText(
    description,
    BILIBILI_DYNAMIC_FALLBACK_TITLE_TEXT_LIMIT,
  );
  if (normalizedDescription) {
    return `${normalizedDescription} - 哔哩哔哩`;
  }

  return BILIBILI_DEFAULT_DYNAMIC_TITLE;
}

// Extract best-effort title from HTML metadata while filtering captcha titles.
function extractTitleFromHtmlDom(htmlDom: CheerioAPI): string | undefined {
  const ogTitle = htmlDom('meta[property="og:title"]').first().attr("content");
  const normalizedOgTitle = normalizeBilibiliPageTitle(ogTitle);
  if (normalizedOgTitle && !isCaptchaLikeTitle(normalizedOgTitle)) {
    return normalizedOgTitle;
  }

  const titleTag = htmlDom("title").first().text();
  const normalizedTitle = normalizeBilibiliPageTitle(titleTag);
  if (!normalizedTitle || isCaptchaLikeTitle(normalizedTitle)) {
    return undefined;
  }
  return normalizedTitle;
}

// Format metric counters for display in metadata/reader sections.
function formatCount(value: number | undefined): string | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return value.toLocaleString("en-US");
}

// Validate whether a hostname belongs to supported Bilibili domains.
function isBilibiliHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase();
  return (
    normalizedHost === "www.bilibili.com" ||
    normalizedHost === "m.bilibili.com" ||
    normalizedHost === "t.bilibili.com" ||
    normalizedHost === "h.bilibili.com" ||
    normalizedHost === "bilibili.com"
  );
}

// Extract first capture group from pathname using a helper regex.
function extractFirstMatch(
  pathname: string,
  regex: RegExp,
): string | undefined {
  const match = pathname.match(regex);
  return match?.[1];
}

/**
 * Route a Bilibili URL into a concrete content target type.
 *
 * Note:
 * - short-link hosts (e.g. b23.tv) should already be resolved by crawler
 *   redirection before metascraper receives the final URL.
 * - opus links may eventually resolve to either dynamic content or article
 *   content (handled later via API fallback fields).
 * - matching order is intentional: article/mobile paths are resolved before
 *   opus and dynamic patterns to avoid ambiguity.
 */
function parseBilibiliTarget(url: string): BilibiliTarget | null {
  try {
    const parsedUrl = new URL(url);
    if (!isBilibiliHost(parsedUrl.hostname)) {
      return null;
    }

    const pathname = parsedUrl.pathname;

    // Article: canonical column URL, e.g. /read/cv123456.
    // Captures numeric cvid after "cv".
    const cvFromRead = extractFirstMatch(pathname, /\/read\/cv(\d+)/i);
    if (cvFromRead) {
      return { kind: "article", cvid: cvFromRead };
    }

    // Article: mobile path variant, e.g. /read/mobile/123456.
    const cvFromMobilePath = extractFirstMatch(
      pathname,
      /\/read\/mobile\/(\d+)/i,
    );
    if (cvFromMobilePath) {
      return { kind: "article", cvid: cvFromMobilePath };
    }

    // Article: mobile query variant, e.g. /read/mobile?id=123456.
    // Here cvid comes from query param instead of path capture.
    if (pathname.startsWith("/read/mobile")) {
      const cvid = toNumericString(
        parsedUrl.searchParams.get("id") ?? undefined,
      );
      if (cvid) {
        return { kind: "article", cvid };
      }
    }

    // Dynamic: opus URL, e.g. /opus/1168746307370614788.
    const opusId = extractFirstMatch(pathname, /\/opus\/(\d+)/i);
    if (opusId) {
      return { kind: "dynamic", dynamicId: opusId };
    }

    // Dynamic: H5 detail URL, e.g. /h5/dynamic/detail/1168746307370614788.
    const h5DynamicId = extractFirstMatch(
      pathname,
      /\/h5\/dynamic\/detail\/(\d+)/i,
    );
    if (h5DynamicId) {
      return { kind: "dynamic", dynamicId: h5DynamicId };
    }

    // Dynamic: t.bilibili short detail URL, e.g. t.bilibili.com/1168....
    // Captures leading numeric segment from root path.
    if (parsedUrl.hostname.toLowerCase() === "t.bilibili.com") {
      const tDynamicId = extractFirstMatch(pathname, /^\/(\d+)/);
      if (tDynamicId) {
        return { kind: "dynamic", dynamicId: tDynamicId };
      }
    }

    // Video: BV identifier URL, e.g. /video/BV1xx411c7mD.
    // BV id format is "BV" + 10 alphanumeric chars.
    const bvidFromVideo = extractFirstMatch(
      pathname,
      /\/video\/(BV[0-9A-Za-z]{10})/i,
    );
    if (bvidFromVideo) {
      return { kind: "video", bvid: bvidFromVideo };
    }

    // Video: legacy av identifier URL, e.g. /video/av170001.
    const aidFromVideo = extractFirstMatch(pathname, /\/video\/av(\d+)/i);
    if (aidFromVideo) {
      return { kind: "video", aid: aidFromVideo };
    }

    // Video: bangumi play URL, e.g. /bangumi/play/ep123 or /bangumi/play/ss456.
    // - ep => episode id
    // - ss => season id
    const bangumiMatch = pathname.match(/\/bangumi\/play\/(ep|ss)(\d+)/i);
    if (bangumiMatch) {
      const [, prefix, id] = bangumiMatch;
      if (prefix.toLowerCase() === "ep") {
        return { kind: "video", epId: id };
      }
      return { kind: "video", seasonId: id };
    }

    // Video: festival page sometimes carries bvid in query, e.g. /festival?...&bvid=BV...
    if (pathname.startsWith("/festival")) {
      const bvid = parsedUrl.searchParams.get("bvid") ?? undefined;
      if (bvid && /^BV[0-9A-Za-z]{10}$/.test(bvid)) {
        return { kind: "video", bvid };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Drop undefined values and convert booleans to 0/1, matching Bilibili's query
// conventions for many web APIs.
function normalizeParams(
  params: Record<string, string | number | boolean | undefined>,
): Record<string, string | number> {
  const normalized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === "boolean") {
      normalized[key] = value ? 1 : 0;
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

// Bilibili dynamic endpoints expect these anti-bot fingerprint parameters.
function buildWbi2Params(): Record<string, string> {
  const alphabet = "ABCDEFGHIJK";
  const pickTwo = (): string => {
    const first = alphabet[Math.floor(Math.random() * alphabet.length)];
    const second = alphabet[Math.floor(Math.random() * alphabet.length)];
    return `${first}${second}`;
  };

  return {
    dm_img_list: "[]",
    dm_img_str: pickTwo(),
    dm_cover_img_str: pickTwo(),
    dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
  };
}

// Apply standard WBI signing: sorted query + wts + md5(query + mixin_key).
function applyWbiSignature(
  params: Record<string, string | number>,
  mixinKey: string,
): Record<string, string | number> {
  const next: Record<string, string | number> = {
    ...params,
    wts: Math.floor(Date.now() / 1000),
  };

  if (!Object.hasOwn(next, "web_location")) {
    next.web_location = 1550101;
  }

  const entries: [string, string][] = Object.entries(next)
    .map(([key, value]) => [key, String(value)] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));

  const query = new URLSearchParams(entries).toString();
  const wRid = createHash("md5")
    .update(query + mixinKey)
    .digest("hex");

  return {
    ...next,
    w_rid: wRid,
  };
}

// Build API URL from base + query. Keeping this centralized makes it easier
// to instrument/log requests consistently later.
function buildApiUrl(
  path: string,
  params: Record<string, string | number>,
): string {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  return `${BILIBILI_API_BASE}${path}?${query.toString()}`;
}

// Parse only the envelope that this plugin needs (`code`, optional payload);
// route-specific parsing is performed by dedicated zod schemas later.
function parseApiEnvelope(payload: unknown): ApiEnvelope | undefined {
  const parsed = apiEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
}

// Extract basename without extension from nav image URLs for mixin key inputs.
function getFilenameWithoutExtension(url: string): string {
  const fileName = url.split("/").pop() ?? "";
  const dotIndex = fileName.indexOf(".");
  if (dotIndex === -1) {
    return fileName;
  }
  return fileName.slice(0, dotIndex);
}

// Called when signed requests are rejected so next retry can recalculate
// WBI parameters from `/x/web-interface/nav`.
function invalidateWbiMixinKey(): void {
  wbiMixinKeyCache = undefined;
}

/**
 * Fetch and cache WBI mixin key from /x/web-interface/nav.
 *
 * The key expires quickly and should be recomputed after anti-bot responses
 * (e.g. -403) because Bilibili may rotate related server-side checks.
 */
async function getWbiMixinKey(
  forceRefresh = false,
): Promise<string | undefined> {
  const now = Date.now();

  if (!forceRefresh && wbiMixinKeyCache && wbiMixinKeyCache.expiresAt > now) {
    return wbiMixinKeyCache.key;
  }

  try {
    const response = await fetchWithProxy(
      `${BILIBILI_API_BASE}/x/web-interface/nav`,
      {
        headers: BILIBILI_HEADERS,
        signal: AbortSignal.timeout(BILIBILI_API_REQUEST_TIMEOUT_MS),
      },
    );

    const payload = await response.json();
    const parsed = navResponseSchema.safeParse(payload);

    // `nav` may return non-zero code for anonymous users (e.g. -101),
    // but still includes a valid `data.wbi_img` used for WBI signing.
    if (!parsed.success) {
      logger.warn(
        "[MetascraperBilibili] Failed to parse nav response for WBI key",
      );
      return undefined;
    }
    if (parsed.data.code !== 0) {
      logger.info(
        `[MetascraperBilibili] nav returned code=${parsed.data.code} but includes wbi_img; continuing`,
      );
    }

    const { img_url: imgUrl, sub_url: subUrl } = parsed.data.data.wbi_img;

    const ae =
      getFilenameWithoutExtension(imgUrl) + getFilenameWithoutExtension(subUrl);

    const mixinKey = WBI_MIXIN_KEY_INDEX_TABLE.map((idx) => ae[idx] ?? "")
      .join("")
      .slice(0, 32);

    if (!mixinKey) {
      return undefined;
    }

    wbiMixinKeyCache = {
      key: mixinKey,
      expiresAt: now + WBI_MIXIN_KEY_TTL_MS,
    };

    return mixinKey;
  } catch (error) {
    logger.warn("[MetascraperBilibili] Failed to load WBI mixin key", error);
    return undefined;
  }
}

/**
 * Shared API request helper with anti-risk behavior:
 * - optional WBI2 fingerprint params
 * - optional WBI signature
 * - optional lightweight desktop cookie for desktop dynamic fallback
 * - exponential backoff retries for risk/transient failures
 */
async function requestBilibiliApi(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  options: ApiRequestOptions = {},
): Promise<ApiEnvelope | undefined> {
  const attempts = Math.max(1, options.retryAttempts ?? 1);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // Keep query deterministic and drop optional undefined fields.
      let requestParams = normalizeParams(params);

      if (options.withWbi2) {
        // Dynamic endpoints often require these fingerprint fields even for
        // read-only/public resources.
        requestParams = {
          ...requestParams,
          ...buildWbi2Params(),
        };
      }

      if (options.withWbi) {
        // On retries, force-refresh is enabled by passing `attempt > 0`.
        const mixinKey = await getWbiMixinKey(attempt > 0);
        if (!mixinKey) {
          if (attempt < attempts - 1) {
            await sleep(backoffDelay(attempt));
            continue;
          }
          return undefined;
        }
        requestParams = applyWbiSignature(requestParams, mixinKey);
      }

      const headers: Record<string, string> = {
        ...BILIBILI_HEADERS,
      };

      if (options.useDesktopCookie) {
        headers.cookie = `buvid3=${randomUUID()}infoc; opus-goback=1`;
      }

      const url = buildApiUrl(path, requestParams);
      const response = await fetchWithProxy(url, {
        headers,
        signal: AbortSignal.timeout(BILIBILI_API_REQUEST_TIMEOUT_MS),
      });

      const payload = await response
        .json()
        .catch(() => ({ code: -1, message: "invalid json" }));

      const parsed = parseApiEnvelope(payload);
      const status = response.status;

      if (!parsed) {
        // Some upstream failures return HTML or malformed JSON.
        if (status >= 500 && attempt < attempts - 1) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        return undefined;
      }

      if (parsed.code === 0) {
        return parsed;
      }

      const shouldRetry =
        status >= 500 ||
        RETRYABLE_API_CODES.has(parsed.code) ||
        parsed.code === -1;

      if (!shouldRetry || attempt >= attempts - 1) {
        return parsed;
      }

      if (parsed.code === -403 && options.withWbi) {
        // Force a new mixin key next attempt when signed requests are rejected.
        invalidateWbiMixinKey();
      }

      await sleep(backoffDelay(attempt));
    } catch (error) {
      // Network-level errors (timeouts, proxy failures, etc.) share the same
      // bounded retry policy.
      if (attempt >= attempts - 1) {
        logger.warn(
          `[MetascraperBilibili] API request failed for ${path}`,
          error,
        );
        return undefined;
      }
      await sleep(backoffDelay(attempt));
    }
  }

  return undefined;
}

// Convert plain text blocks into simple paragraph HTML that Reader can render
// without requiring site-specific CSS or JS.
function htmlParagraphsFromPlainText(text: string | undefined): string {
  if (!text) {
    return "";
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  const sections = trimmed
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return "";
  }

  return sections
    .map((section) => `<p>${escapeHtml(section).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

// Helper for generating metadata descriptions from HTML payloads.
function toPlainTextFromHtml(html: string): string {
  const dom = new JSDOM(`<body>${html}</body>`);
  try {
    return (
      dom.window.document.body.textContent?.replace(/\s+/g, " ").trim() ?? ""
    );
  } finally {
    dom.window.close();
  }
}

// Bilibili article HTML can contain scripting/layout-specific nodes that are
// not useful in Reader. This function keeps content-focused markup only and
// normalizes media/link attributes before final sanitizer runs upstream.
function normalizeArticleContentHtml(content: string | undefined): string {
  if (!content) {
    return "";
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }

  if (!trimmed.includes("<")) {
    return htmlParagraphsFromPlainText(trimmed);
  }

  const dom = new JSDOM(`<body>${trimmed}</body>`);

  try {
    const document = dom.window.document;

    // Keep only reader-safe, content-centric markup here.
    for (const node of document.querySelectorAll("script, style, noscript")) {
      node.remove();
    }

    for (const image of document.querySelectorAll("img")) {
      const dataSrc = image.getAttribute("data-src");
      const src = image.getAttribute("src");
      const resolved = normalizeImageUrl(src ?? dataSrc ?? undefined);
      if (resolved) {
        image.setAttribute("src", resolved);
      }
      image.setAttribute("referrerpolicy", "no-referrer");
      image.removeAttribute("data-src");
      image.removeAttribute("srcset");
      image.removeAttribute("loading");
    }

    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = normalizeLinkUrl(anchor.getAttribute("href") ?? undefined);
      if (href) {
        anchor.setAttribute("href", href);
      }
    }

    return document.body.innerHTML;
  } finally {
    dom.window.close();
  }
}

// Shared HTML shell used by video/dynamic/article renderers so metadata header
// and content structure stay consistent across content types.
function createReaderArticleWrapper(
  className: string,
  title: string,
  author: string | undefined,
  datePublished: string | undefined,
  coverImage: string | undefined,
  bodyHtml: string,
  extraMetaHtml?: string,
): string {
  const metaParts: string[] = [];

  if (author) {
    metaParts.push(
      `<span class="kk-bili-meta-author">${escapeHtml(author)}</span>`,
    );
  }

  if (datePublished) {
    const date = new Date(datePublished);
    if (!Number.isNaN(date.getTime())) {
      metaParts.push(
        `<time datetime="${escapeHtml(datePublished)}">${escapeHtml(
          date.toLocaleString("zh-CN", { hour12: false }),
        )}</time>`,
      );
    }
  }

  metaParts.push(
    `<span class="kk-bili-meta-publisher">${BILIBILI_PUBLISHER}</span>`,
  );

  const coverHtml = coverImage
    ? `<figure class="kk-bili-cover"><img src="${escapeHtml(
        coverImage,
      )}" alt="${escapeHtml(title)}" loading="lazy" referrerpolicy="no-referrer" /></figure>`
    : "";

  const extra = extraMetaHtml
    ? `<div class="kk-bili-extra">${extraMetaHtml}</div>`
    : "";

  return [
    `<article class="${escapeHtml(className)}">`,
    `<header class="kk-bili-header">`,
    `<h1>${escapeHtml(title)}</h1>`,
    `<div class="kk-bili-meta">${metaParts.join(" <span>·</span> ")}</div>`,
    extra,
    `</header>`,
    coverHtml,
    `<section class="kk-bili-content">${bodyHtml}</section>`,
    `</article>`,
  ].join("\n");
}

// Parse Bilibili rich-text node arrays into:
// - `text`: plain text used for description fallback
// - `html`: reader-friendly inline markup (links/emoji/text)
function extractTextAndHtmlFromOpusNodes(nodes: unknown): TextAndHtml {
  if (!Array.isArray(nodes)) {
    return { text: "", html: "" };
  }

  const textParts: string[] = [];
  const htmlParts: string[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const word =
      "word" in node && node.word && typeof node.word === "object"
        ? node.word
        : undefined;
    const rich =
      "rich" in node && node.rich && typeof node.rich === "object"
        ? node.rich
        : undefined;

    const words =
      word && "words" in word && typeof word.words === "string"
        ? word.words
        : undefined;

    if (words) {
      textParts.push(words);
      htmlParts.push(escapeHtml(words));
      continue;
    }

    if (!rich) {
      continue;
    }

    const richText =
      "text" in rich && typeof rich.text === "string" ? rich.text : "";

    const jumpUrl =
      "jump_url" in rich && typeof rich.jump_url === "string"
        ? normalizeLinkUrl(rich.jump_url)
        : undefined;

    const emoji =
      "emoji" in rich && rich.emoji && typeof rich.emoji === "object"
        ? rich.emoji
        : undefined;

    const emojiIcon =
      emoji && "icon_url" in emoji && typeof emoji.icon_url === "string"
        ? normalizeImageUrl(emoji.icon_url)
        : undefined;

    if (emojiIcon) {
      const altText = richText || "emoji";
      textParts.push(altText);
      htmlParts.push(
        `<img src="${escapeHtml(emojiIcon)}" alt="${escapeHtml(
          altText,
        )}" class="kk-bili-emoji" referrerpolicy="no-referrer" />`,
      );
      continue;
    }

    if (jumpUrl && richText) {
      textParts.push(richText);
      htmlParts.push(
        `<a href="${escapeHtml(jumpUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          richText,
        )}</a>`,
      );
      continue;
    }

    if (richText) {
      textParts.push(richText);
      htmlParts.push(escapeHtml(richText));
    }
  }

  return {
    text: textParts.join(""),
    html: htmlParts.join(""),
  };
}

// Format opus stat module counters into a short Reader metadata line.
function extractOpusStats(moduleStat: unknown): string | undefined {
  if (!moduleStat || typeof moduleStat !== "object") {
    return undefined;
  }

  const moduleStatRecord = moduleStat as Record<string, unknown>;

  const getCount = (key: string): string | undefined => {
    if (!(key in moduleStatRecord)) {
      return undefined;
    }

    const maybeCounter = moduleStatRecord[key];
    if (!maybeCounter || typeof maybeCounter !== "object") {
      return undefined;
    }

    const maybeCounterRecord = maybeCounter as Record<string, unknown>;
    const count =
      typeof maybeCounterRecord.count === "number"
        ? maybeCounterRecord.count
        : undefined;

    return formatCount(count);
  };

  const items: string[] = [];

  const forward = getCount("forward");
  if (forward) {
    items.push(`${DYNAMIC_STAT_LABELS.repost} ${forward}`);
  }

  const comment = getCount("comment");
  if (comment) {
    items.push(`${DYNAMIC_STAT_LABELS.comment} ${comment}`);
  }

  const like = getCount("like");
  if (like) {
    items.push(`${DYNAMIC_STAT_LABELS.like} ${like}`);
  }

  return items.length > 0 ? items.join(" · ") : undefined;
}

// Parse the canonical opus/detail payload into metadata + rendered body.
// This is the highest-quality dynamic path because structure is explicit.
function parseOpusItem(
  item: OpusItem | undefined,
): OpusParseResult | undefined {
  if (!item) {
    return undefined;
  }

  const modules = item.modules ?? [];

  let title: string | undefined;
  let author: string | undefined;
  let datePublished: string | undefined;
  let statsText: string | undefined;

  const textParts: string[] = [];
  const htmlBlocks: string[] = [];
  const images: string[] = [];

  for (const module of modules) {
    if ("module_title" in module) {
      const maybeTitle = module.module_title;
      if (
        maybeTitle &&
        typeof maybeTitle === "object" &&
        "text" in maybeTitle &&
        typeof maybeTitle.text === "string"
      ) {
        title = maybeTitle.text.trim() || title;
      }
    }

    if ("module_author" in module) {
      const moduleAuthor = module.module_author;
      if (moduleAuthor && typeof moduleAuthor === "object") {
        if ("name" in moduleAuthor && typeof moduleAuthor.name === "string") {
          author = moduleAuthor.name.trim() || author;
        }

        if (
          "pub_ts" in moduleAuthor &&
          typeof moduleAuthor.pub_ts === "number"
        ) {
          datePublished =
            toIsoDateFromSeconds(moduleAuthor.pub_ts) ?? datePublished;
        }
      }
    }

    if ("module_content" in module) {
      const moduleContent = module.module_content;
      if (
        !moduleContent ||
        typeof moduleContent !== "object" ||
        !("paragraphs" in moduleContent) ||
        !Array.isArray(moduleContent.paragraphs)
      ) {
        continue;
      }

      for (const paragraph of moduleContent.paragraphs) {
        if (!paragraph || typeof paragraph !== "object") {
          continue;
        }

        const paraType =
          "para_type" in paragraph && typeof paragraph.para_type === "number"
            ? paragraph.para_type
            : undefined;

        if (paraType === 1) {
          // Rich text paragraph.
          const textNode =
            "text" in paragraph &&
            paragraph.text &&
            typeof paragraph.text === "object"
              ? paragraph.text
              : undefined;

          const nodes =
            textNode && "nodes" in textNode ? textNode.nodes : undefined;
          const textAndHtml = extractTextAndHtmlFromOpusNodes(nodes);
          if (textAndHtml.text) {
            textParts.push(textAndHtml.text);
          }
          if (textAndHtml.html) {
            htmlBlocks.push(
              `<p>${textAndHtml.html.replace(/\n/g, "<br />")}</p>`,
            );
          }
          continue;
        }

        if (paraType === 2) {
          // Image paragraph.
          const picField =
            "pic" in paragraph &&
            paragraph.pic &&
            typeof paragraph.pic === "object"
              ? paragraph.pic
              : undefined;

          const pics =
            picField && "pics" in picField ? picField.pics : undefined;

          if (!Array.isArray(pics)) {
            continue;
          }

          const imageHtmlParts: string[] = [];

          for (const pic of pics) {
            if (!pic || typeof pic !== "object") {
              continue;
            }

            const url =
              "url" in pic && typeof pic.url === "string" ? pic.url : undefined;
            const normalized = normalizeImageUrl(url);
            if (!normalized) {
              continue;
            }

            images.push(normalized);
            imageHtmlParts.push(
              `<figure><img src="${escapeHtml(
                normalized,
              )}" alt="bilibili image" loading="lazy" referrerpolicy="no-referrer" /></figure>`,
            );
          }

          if (imageHtmlParts.length > 0) {
            htmlBlocks.push(imageHtmlParts.join("\n"));
          }
          continue;
        }

        if (paraType === 7) {
          // Code block paragraph.
          const codeField =
            "code" in paragraph &&
            paragraph.code &&
            typeof paragraph.code === "object"
              ? paragraph.code
              : undefined;

          const content =
            codeField &&
            "content" in codeField &&
            typeof codeField.content === "string"
              ? codeField.content
              : undefined;

          const language =
            codeField &&
            "lang" in codeField &&
            typeof codeField.lang === "string"
              ? codeField.lang
              : "";

          if (content) {
            textParts.push(content);
            htmlBlocks.push(
              `<pre><code class="${escapeHtml(language)}">${escapeHtml(
                content,
              )}</code></pre>`,
            );
          }
        }
      }
    }

    if ("module_stat" in module) {
      statsText = extractOpusStats(module.module_stat) ?? statsText;
    }
  }

  const description = truncateText(textParts.join("\n"), 280);
  const image = images[0];

  return {
    title,
    author,
    datePublished,
    description,
    image,
    bodyHtml: htmlBlocks.join("\n") || htmlParagraphsFromPlainText(description),
    statsText,
  };
}

// Collector used by fallback dynamic parsers where payload shape can drift.
// We intentionally deduplicate text/images to reduce noisy repeated blocks.
function createDesktopCollector(): DesktopCollector {
  return {
    texts: [],
    textSet: new Set<string>(),
    images: [],
    imageSet: new Set<string>(),
    cards: [],
    cardSet: new Set<string>(),
  };
}

// Add a normalized text fragment into the fallback collector with deduplication.
function addDesktopText(
  collector: DesktopCollector,
  text: string | undefined,
): void {
  if (!text) {
    return;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return;
  }

  if (collector.textSet.has(normalized)) {
    return;
  }

  collector.textSet.add(normalized);
  collector.texts.push(normalized);
}

// Heuristic key matcher for image-like fields in loosely typed payloads.
function isLikelyImageFieldName(key: string): boolean {
  return (
    key === "src" ||
    key === "url" ||
    key === "cover" ||
    key === "first_pic" ||
    key === "image_url"
  );
}

// Add an image candidate into collector only when key/value looks valid.
function addDesktopImage(
  collector: DesktopCollector,
  key: string,
  value: string | undefined,
): void {
  if (!isLikelyImageFieldName(key)) {
    return;
  }

  const normalized = normalizeImageUrl(value);
  if (!normalized) {
    return;
  }

  if (collector.imageSet.has(normalized)) {
    return;
  }

  collector.imageSet.add(normalized);
  collector.images.push(normalized);
}

// Card extraction is intentionally conservative: require at least a title.
function addDesktopCard(
  collector: DesktopCollector,
  title: string | undefined,
  jumpUrl: string | undefined,
  cover: string | undefined,
  description: string | undefined,
): void {
  const normalizedTitle = title?.trim();
  if (!normalizedTitle) {
    return;
  }

  const normalizedUrl = normalizeLinkUrl(jumpUrl);
  const normalizedCover = normalizeImageUrl(cover);
  const normalizedDescription = description?.trim() || undefined;
  const dedupeKey = [
    normalizedTitle,
    normalizedUrl ?? "",
    normalizedCover ?? "",
    normalizedDescription ?? "",
  ].join("\u001f");
  if (collector.cardSet.has(dedupeKey)) {
    return;
  }
  collector.cardSet.add(dedupeKey);

  collector.cards.push({
    title: normalizedTitle,
    url: normalizedUrl,
    cover: normalizedCover,
    description: normalizedDescription,
  });
}

// Generic recursive collector for web/desktop dynamic fallback payloads.
// The goal is robustness against API schema changes, not perfect semantics.
function collectDesktopDynamic(
  collector: DesktopCollector,
  value: unknown,
  depth = 0,
): void {
  // Guard against unusually deep nested payloads.
  if (depth > DYNAMIC_COLLECT_MAX_DEPTH) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectDesktopDynamic(collector, item, depth + 1);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, field] of Object.entries(value)) {
    if (typeof field === "string") {
      addDesktopImage(collector, key, field);

      if (
        key === "text" ||
        key === "desc" ||
        key === "summary" ||
        key === "title"
      ) {
        addDesktopText(collector, field);
      }

      continue;
    }

    if (Array.isArray(field)) {
      if (key === "covers" || key === "pics" || key === "items") {
        for (const item of field) {
          collectDesktopDynamic(collector, item, depth + 1);
        }
      } else {
        collectDesktopDynamic(collector, field, depth + 1);
      }
      continue;
    }

    if (!field || typeof field !== "object") {
      continue;
    }

    const maybeTitle =
      "title" in field && typeof field.title === "string"
        ? field.title
        : undefined;
    const maybeJumpUrl =
      "jump_url" in field && typeof field.jump_url === "string"
        ? field.jump_url
        : undefined;
    const maybeCover =
      "cover" in field && typeof field.cover === "string"
        ? field.cover
        : undefined;
    const maybeDesc =
      "desc" in field && typeof field.desc === "string"
        ? field.desc
        : undefined;

    addDesktopCard(collector, maybeTitle, maybeJumpUrl, maybeCover, maybeDesc);

    collectDesktopDynamic(collector, field, depth + 1);
  }
}

// Format desktop fallback stat payloads into a concise stats string.
function extractDesktopStats(moduleStat: unknown): string | undefined {
  if (!moduleStat || typeof moduleStat !== "object") {
    return undefined;
  }

  const moduleStatRecord = moduleStat as Record<string, unknown>;

  const getCount = (key: string): string | undefined => {
    if (!(key in moduleStatRecord)) {
      return undefined;
    }

    const maybeCounter = moduleStatRecord[key];
    if (!maybeCounter || typeof maybeCounter !== "object") {
      return undefined;
    }

    const maybeCounterRecord = maybeCounter as Record<string, unknown>;
    const count =
      typeof maybeCounterRecord.count === "number"
        ? maybeCounterRecord.count
        : undefined;

    return formatCount(count);
  };

  const parts: string[] = [];

  const forward = getCount("forward");
  if (forward) {
    parts.push(`${DYNAMIC_STAT_LABELS.repost} ${forward}`);
  }

  const comment = getCount("comment");
  if (comment) {
    parts.push(`${DYNAMIC_STAT_LABELS.comment} ${comment}`);
  }

  const like = getCount("like");
  if (like) {
    parts.push(`${DYNAMIC_STAT_LABELS.like} ${like}`);
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// Small runtime guard used repeatedly to avoid unsafe property access.
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return value as Record<string, unknown>;
}

// Some endpoints return `modules` as array; others return object map.
function normalizeDynamicModules(modules: unknown): Record<string, unknown>[] {
  if (Array.isArray(modules)) {
    return modules.filter(
      (module): module is Record<string, unknown> =>
        !!module && typeof module === "object",
    );
  }

  const modulesRecord = asRecord(modules);
  if (!modulesRecord) {
    return [];
  }

  return Object.values(modulesRecord).filter(
    (module): module is Record<string, unknown> =>
      !!module && typeof module === "object",
  );
}

// Dynamic endpoints may return payload under different nesting paths.
// This helper extracts the likely "item-like" object consistently.
function extractDynamicItemFromEnvelope(
  envelope: ApiEnvelope | undefined,
): unknown | undefined {
  if (!envelope || envelope.code !== 0) {
    return undefined;
  }

  const data = asRecord(envelope.data);
  if (!data) {
    const envelopeRecord = asRecord(envelope);
    if (!envelopeRecord) {
      return undefined;
    }

    const topLevelItem = asRecord(envelopeRecord.item);
    if (topLevelItem) {
      return topLevelItem;
    }

    const fallbackItem = { ...envelopeRecord };
    delete fallbackItem.code;
    delete fallbackItem.message;
    delete fallbackItem.data;
    delete fallbackItem.result;

    return Object.keys(fallbackItem).length > 0 ? fallbackItem : undefined;
  }

  return asRecord(data.item) ?? data;
}

// Fallback parser for dynamic detail payloads (web/desktop).
// Title handling is strict to avoid regressing into "first card title" bugs.
function parseDesktopDynamicItem(
  item: unknown,
): DesktopParseResult | undefined {
  const itemRecord = asRecord(item);
  if (!itemRecord) {
    return undefined;
  }

  const collector = createDesktopCollector();
  const modules = normalizeDynamicModules(itemRecord.modules);

  let author: string | undefined;
  let datePublished: string | undefined;
  let statsText: string | undefined;
  let explicitTitle: string | undefined;
  let explicitDescription: string | undefined;

  for (const module of modules) {
    if ("module_title" in module) {
      const moduleTitle = module.module_title;
      if (
        moduleTitle &&
        typeof moduleTitle === "object" &&
        "text" in moduleTitle &&
        typeof moduleTitle.text === "string"
      ) {
        explicitTitle = moduleTitle.text.trim() || explicitTitle;
      }
    }

    if ("module_author" in module) {
      const moduleAuthor = module.module_author;
      if (moduleAuthor && typeof moduleAuthor === "object") {
        if ("name" in moduleAuthor && typeof moduleAuthor.name === "string") {
          author = moduleAuthor.name.trim() || author;
        }

        const user =
          "user" in moduleAuthor &&
          moduleAuthor.user &&
          typeof moduleAuthor.user === "object"
            ? moduleAuthor.user
            : undefined;

        if (user && "name" in user && typeof user.name === "string") {
          author = user.name.trim() || author;
        }

        if (
          "pub_ts" in moduleAuthor &&
          typeof moduleAuthor.pub_ts === "number"
        ) {
          datePublished =
            toIsoDateFromSeconds(moduleAuthor.pub_ts) ?? datePublished;
        }
      }
    }

    if ("module_desc" in module) {
      const moduleDesc = module.module_desc;
      if (
        moduleDesc &&
        typeof moduleDesc === "object" &&
        "text" in moduleDesc &&
        typeof moduleDesc.text === "string"
      ) {
        explicitDescription = moduleDesc.text;
        addDesktopText(collector, moduleDesc.text);
      }
    }

    if ("module_stat" in module) {
      statsText = extractDesktopStats(module.module_stat) ?? statsText;
    }
  }

  // Collect plain text/images/cards from the whole payload to tolerate
  // endpoint shape drift (modules object/array/flat fields).
  collectDesktopDynamic(collector, itemRecord);

  if (!explicitTitle && typeof itemRecord.title === "string") {
    explicitTitle = itemRecord.title.trim() || undefined;
  }

  if (!author) {
    const rootAuthor = asRecord(itemRecord.author);
    if (rootAuthor && typeof rootAuthor.name === "string") {
      author = rootAuthor.name.trim() || undefined;
    }
  }

  if (!datePublished) {
    const rootPubTs =
      typeof itemRecord.pub_ts === "number"
        ? itemRecord.pub_ts
        : typeof itemRecord.pubdate === "number"
          ? itemRecord.pubdate
          : typeof itemRecord.publish_time === "number"
            ? itemRecord.publish_time
            : typeof itemRecord.ctime === "number"
              ? itemRecord.ctime
              : undefined;
    datePublished = toIsoDateFromSeconds(rootPubTs) ?? datePublished;
  }

  if (!explicitDescription && typeof itemRecord.text === "string") {
    explicitDescription = itemRecord.text;
  }

  if (!statsText) {
    statsText =
      extractDesktopStats(itemRecord.module_stat) ??
      extractDesktopStats(itemRecord.stats) ??
      statsText;
  }

  const description =
    truncateText(explicitDescription, 280) ??
    truncateText(collector.texts[0], 280);

  // Only keep explicit dynamic title for metadata to avoid promoting linked-card
  // titles as the bookmark title.
  const title = explicitTitle;

  const image = collector.images[0];

  const cardCoverSet = new Set(
    collector.cards
      .map((card) => card.cover)
      .filter((cover): cover is string => typeof cover === "string"),
  );
  const cardTextSet = new Set(
    collector.cards.flatMap((card) =>
      [card.title, card.description]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  const nonCardTexts = collector.texts.filter((text) => !cardTextSet.has(text));
  const nonCardImages = collector.images.filter(
    (imageUrl) => !cardCoverSet.has(imageUrl),
  );

  const blocks: string[] = [];
  if (nonCardTexts.length > 0) {
    blocks.push(
      ...nonCardTexts.map(
        (text) => `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`,
      ),
    );
  }

  if (nonCardImages.length > 0) {
    blocks.push(
      ...nonCardImages.map(
        (imageUrl) =>
          `<figure><img src="${escapeHtml(
            imageUrl,
          )}" alt="bilibili image" loading="lazy" referrerpolicy="no-referrer" /></figure>`,
      ),
    );
  }

  if (collector.cards.length > 0) {
    const cardHtml = collector.cards
      .slice(0, 5)
      .map((card) => {
        const parts: string[] = [];
        if (card.cover) {
          parts.push(
            `<img src="${escapeHtml(card.cover)}" alt="${escapeHtml(
              card.title,
            )}" loading="lazy" referrerpolicy="no-referrer" />`,
          );
        }
        parts.push(`<strong>${escapeHtml(card.title)}</strong>`);
        if (card.description) {
          parts.push(`<p>${escapeHtml(card.description)}</p>`);
        }

        const body = parts.join("\n");
        if (card.url) {
          return `<a href="${escapeHtml(
            card.url,
          )}" target="_blank" rel="noopener noreferrer">${body}</a>`;
        }
        return `<div>${body}</div>`;
      })
      .join("\n");

    blocks.push(`<section class="kk-bili-cards">${cardHtml}</section>`);
  }

  const bodyHtml =
    blocks.join("\n") || htmlParagraphsFromPlainText(description);
  if (!title && !description && !image && !bodyHtml) {
    return undefined;
  }

  return {
    title,
    author,
    datePublished,
    description,
    image,
    bodyHtml,
    statsText,
  };
}

// Parse a JSON string field into a plain object record.
function parseJsonRecord(value: string | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

// Normalize text extracted from legacy dynamic payload fields.
function normalizeLegacyDynamicText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized === "转发动态") {
    return undefined;
  }
  return normalized;
}

// Pick the first non-empty description candidate from legacy card payload.
function extractLegacyDynamicDescription(
  legacyCardRecord: Record<string, unknown>,
): string | undefined {
  const item = asRecord(legacyCardRecord.item);
  const originRecord = parseJsonRecord(
    typeof legacyCardRecord.origin === "string"
      ? legacyCardRecord.origin
      : undefined,
  );
  const originItem = asRecord(originRecord.item);

  const candidates = [
    item?.description,
    item?.content,
    legacyCardRecord.dynamic,
    legacyCardRecord.desc,
    legacyCardRecord.title,
    originItem?.description,
    originItem?.content,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLegacyDynamicText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

// Extract the first usable image URL from legacy card payload.
function extractLegacyDynamicImage(
  legacyCardRecord: Record<string, unknown>,
): string | undefined {
  const pickImageFromPictures = (pictures: unknown): string | undefined => {
    if (!Array.isArray(pictures)) {
      return undefined;
    }

    for (const picture of pictures) {
      const pictureRecord = asRecord(picture);
      if (!pictureRecord) {
        continue;
      }

      const imageCandidate =
        (typeof pictureRecord.img_src === "string"
          ? pictureRecord.img_src
          : undefined) ??
        (typeof pictureRecord.src === "string"
          ? pictureRecord.src
          : undefined) ??
        (typeof pictureRecord.img_url === "string"
          ? pictureRecord.img_url
          : undefined) ??
        (typeof pictureRecord.url === "string" ? pictureRecord.url : undefined);

      const normalized = normalizeImageUrl(imageCandidate);
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  };

  const item = asRecord(legacyCardRecord.item);
  const originRecord = parseJsonRecord(
    typeof legacyCardRecord.origin === "string"
      ? legacyCardRecord.origin
      : undefined,
  );
  const originItem = asRecord(originRecord.item);

  return (
    normalizeImageUrl(
      typeof legacyCardRecord.pic === "string"
        ? legacyCardRecord.pic
        : undefined,
    ) ??
    pickImageFromPictures(item?.pictures) ??
    pickImageFromPictures(originItem?.pictures) ??
    normalizeImageUrl(
      typeof originItem?.pic === "string" ? originItem.pic : undefined,
    )
  );
}

// Extract compact stats line from legacy dynamic desc payload.
function extractLegacyDynamicStats(
  descRecord: Record<string, unknown> | undefined,
): string | undefined {
  if (!descRecord) {
    return undefined;
  }

  const getCount = (key: string): string | undefined => {
    const value =
      typeof descRecord[key] === "number"
        ? (descRecord[key] as number)
        : undefined;
    return formatCount(value);
  };

  const parts: string[] = [];
  const repost = getCount("repost");
  if (repost) {
    parts.push(`${DYNAMIC_STAT_LABELS.repost} ${repost}`);
  }

  const comment = getCount("comment");
  if (comment) {
    parts.push(`${DYNAMIC_STAT_LABELS.comment} ${comment}`);
  }

  const like = getCount("like");
  if (like) {
    parts.push(`${DYNAMIC_STAT_LABELS.like} ${like}`);
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// Last-resort dynamic fallback from legacy `dynamic_svr` detail endpoint.
async function resolveLegacyDynamicMetadata(
  dynamicId: string,
): Promise<BilibiliMetadata | undefined> {
  const url = `${BILIBILI_LEGACY_API_BASE}/dynamic_svr/v1/dynamic_svr/get_dynamic_detail?${new URLSearchParams(
    {
      dynamic_id: dynamicId,
    },
  ).toString()}`;

  const attempts = 2;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithProxy(url, {
        headers: BILIBILI_HEADERS,
        signal: AbortSignal.timeout(BILIBILI_API_REQUEST_TIMEOUT_MS),
      });

      const payload = await response
        .json()
        .catch(() => ({ code: -1, message: "invalid json" }));

      const parsed = legacyDynamicDetailResponseSchema.safeParse(payload);
      if (!parsed.success) {
        if (response.status >= 500 && attempt < attempts - 1) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        return undefined;
      }

      if (parsed.data.code !== 0) {
        const shouldRetry =
          response.status >= 500 || RETRYABLE_API_CODES.has(parsed.data.code);
        if (shouldRetry && attempt < attempts - 1) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        return undefined;
      }

      const desc = parsed.data.data?.card?.desc;
      const descRecord = asRecord(desc);
      const legacyCardRecord = parseJsonRecord(parsed.data.data?.card?.card);
      const userProfile = asRecord(descRecord?.user_profile);
      const userInfo = asRecord(userProfile?.info);
      const cardUser = asRecord(legacyCardRecord.user);

      const author =
        (typeof userInfo?.uname === "string" ? userInfo.uname : undefined) ??
        (typeof cardUser?.name === "string" ? cardUser.name : undefined);
      const description = extractLegacyDynamicDescription(legacyCardRecord);
      const image = extractLegacyDynamicImage(legacyCardRecord);
      const datePublished =
        desc && typeof desc.timestamp === "number"
          ? toIsoDateFromSeconds(desc.timestamp)
          : undefined;
      const statsText = extractLegacyDynamicStats(descRecord);
      if (!author && !description && !image) {
        return undefined;
      }
      const title = buildDynamicFallbackTitle(author, description);

      const bodyParts: string[] = [];
      const paragraphHtml = htmlParagraphsFromPlainText(description);
      if (paragraphHtml) {
        bodyParts.push(paragraphHtml);
      }
      if (image) {
        bodyParts.push(
          `<figure><img src="${escapeHtml(
            image,
          )}" alt="bilibili image" loading="lazy" referrerpolicy="no-referrer" /></figure>`,
        );
      }

      const readableContentHtml = renderDynamicHtml({
        title,
        author,
        datePublished,
        image,
        bodyHtml: bodyParts.join("\n"),
        statsText,
      });

      return metadataWithDefaults({
        title,
        description,
        image,
        author,
        datePublished,
        readableContentHtml,
      });
    } catch {
      if (attempt >= attempts - 1) {
        return undefined;
      }
      await sleep(backoffDelay(attempt));
    }
  }

  return undefined;
}

// Ensure common metadata defaults are always present for downstream consumers.
function metadataWithDefaults(
  metadata: BilibiliMetadata | undefined,
): BilibiliMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return {
    ...metadata,
    publisher: metadata.publisher ?? BILIBILI_PUBLISHER,
    logo: metadata.logo ?? BILIBILI_FAVICON,
  };
}

// Render video metadata into Reader article structure.
function renderVideoHtml(input: {
  title: string;
  author?: string;
  datePublished?: string;
  image?: string;
  description?: string;
  stats?: {
    view?: number;
    danmaku?: number;
    reply?: number;
    like?: number;
    favorite?: number;
    coin?: number;
    share?: number;
  };
}): string {
  const statParts: string[] = [];

  if (input.stats) {
    const statMapping: [string, number | undefined][] = [
      [VIDEO_STAT_LABELS.view, input.stats.view],
      [VIDEO_STAT_LABELS.danmaku, input.stats.danmaku],
      [VIDEO_STAT_LABELS.reply, input.stats.reply],
      [VIDEO_STAT_LABELS.like, input.stats.like],
      [VIDEO_STAT_LABELS.favorite, input.stats.favorite],
      [VIDEO_STAT_LABELS.coin, input.stats.coin],
      [VIDEO_STAT_LABELS.share, input.stats.share],
    ];

    for (const [label, value] of statMapping) {
      const formatted = formatCount(value);
      if (!formatted) {
        continue;
      }
      statParts.push(
        `<span>${escapeHtml(label)} ${escapeHtml(formatted)}</span>`,
      );
    }
  }

  const extraMetaHtml =
    statParts.length > 0 ? statParts.join(" <span>·</span> ") : "";

  return createReaderArticleWrapper(
    "kk-bili kk-bili-video",
    input.title,
    input.author,
    input.datePublished,
    input.image,
    htmlParagraphsFromPlainText(input.description),
    extraMetaHtml,
  );
}

// Render dynamic metadata into Reader article structure.
function renderDynamicHtml(input: {
  title: string;
  author?: string;
  datePublished?: string;
  image?: string;
  bodyHtml: string;
  statsText?: string;
}): string {
  return createReaderArticleWrapper(
    "kk-bili kk-bili-dynamic",
    input.title,
    input.author,
    input.datePublished,
    input.image,
    input.bodyHtml,
    input.statsText ? `<span>${escapeHtml(input.statsText)}</span>` : undefined,
  );
}

// Render article metadata into Reader article structure.
function renderArticleHtml(input: {
  title: string;
  author?: string;
  datePublished?: string;
  image?: string;
  bodyHtml: string;
}): string {
  return createReaderArticleWrapper(
    "kk-bili kk-bili-article",
    input.title,
    input.author,
    input.datePublished,
    input.image,
    input.bodyHtml,
  );
}

// Convert parsed dynamic payload into final metadata + Reader HTML fields.
function buildDynamicMetadataFromParseResult(
  parsed: DesktopParseResult,
): BilibiliMetadata {
  const resolvedTitle =
    parsed.title?.trim() ||
    buildDynamicFallbackTitle(parsed.author, parsed.description);
  const readableContentHtml = renderDynamicHtml({
    title: resolvedTitle,
    author: parsed.author,
    datePublished: parsed.datePublished,
    image: parsed.image,
    bodyHtml: parsed.bodyHtml,
    statsText: parsed.statsText,
  });

  const metadata = metadataWithDefaults({
    title: resolvedTitle,
    description: parsed.description,
    image: parsed.image,
    author: parsed.author,
    datePublished: parsed.datePublished,
    readableContentHtml,
  });

  return metadata ?? { readableContentHtml, publisher: BILIBILI_PUBLISHER };
}

// Resolve playable video identifiers when URL only carries bangumi ep/ss IDs.
async function resolveVideoIdentifiers(
  target: Extract<BilibiliTarget, { kind: "video" }>,
): Promise<{ bvid?: string; aid?: string } | undefined> {
  if (target.bvid || target.aid) {
    return {
      bvid: target.bvid,
      aid: target.aid,
    };
  }

  // Some bangumi links only contain ep/ss IDs and need an extra resolution step.
  if (!target.epId && !target.seasonId) {
    return undefined;
  }

  const seasonResponse = await requestBilibiliApi(
    "/pgc/view/web/season",
    {
      ep_id: target.epId,
      season_id: target.seasonId,
    },
    { retryAttempts: 2 },
  );

  if (!seasonResponse || seasonResponse.code !== 0) {
    return undefined;
  }

  const parsed = seasonResponseSchema.safeParse(seasonResponse);
  if (!parsed.success || parsed.data.code !== 0) {
    return undefined;
  }

  const episodes = parsed.data.result?.episodes ?? [];

  if (episodes.length === 0) {
    return undefined;
  }

  let selectedEpisode = episodes[0];

  if (target.epId) {
    const matched = episodes.find((episode) => {
      const epId = toNumericString(episode.ep_id);
      const id = toNumericString(episode.id);
      return epId === target.epId || id === target.epId;
    });

    if (matched) {
      selectedEpisode = matched;
    }
  }

  return {
    bvid: selectedEpisode.bvid,
    aid: toNumericString(selectedEpisode.aid),
  };
}

// Resolve regular video pages from `/x/web-interface/view`.
async function resolveVideoMetadata(
  target: Extract<BilibiliTarget, { kind: "video" }>,
): Promise<BilibiliMetadata | undefined> {
  const identifiers = await resolveVideoIdentifiers(target);

  if (!identifiers?.bvid && !identifiers?.aid) {
    return undefined;
  }

  const viewResponse = await requestBilibiliApi(
    "/x/web-interface/view",
    {
      bvid: identifiers.bvid,
      aid: identifiers.aid,
    },
    { retryAttempts: 2 },
  );

  if (!viewResponse || viewResponse.code !== 0) {
    return undefined;
  }

  const parsed = videoViewResponseSchema.safeParse(viewResponse);
  if (!parsed.success || parsed.data.code !== 0 || !parsed.data.data) {
    return undefined;
  }

  const videoData = parsed.data.data;

  const title = videoData.title?.trim();
  if (!title) {
    return undefined;
  }

  const description = videoData.desc?.trim() || undefined;
  const image = normalizeImageUrl(videoData.pic);
  const author = videoData.owner?.name?.trim() || undefined;
  const datePublished =
    toIsoDateFromSeconds(videoData.pubdate) ??
    toIsoDateFromSeconds(videoData.ctime);

  const readableContentHtml = renderVideoHtml({
    title,
    author,
    datePublished,
    image,
    description,
    stats: videoData.stat,
  });

  return metadataWithDefaults({
    title,
    description,
    image,
    author,
    datePublished,
    readableContentHtml,
  });
}

// Resolve article/column pages from `/x/article/view`.
async function resolveArticleById(
  cvid: string,
): Promise<BilibiliMetadata | undefined> {
  const articleResponse = await requestBilibiliApi(
    "/x/article/view",
    { id: cvid },
    { retryAttempts: 2 },
  );

  if (!articleResponse || articleResponse.code !== 0) {
    return undefined;
  }

  const parsed = articleViewResponseSchema.safeParse(articleResponse);
  if (!parsed.success || parsed.data.code !== 0 || !parsed.data.data) {
    return undefined;
  }

  const articleData = parsed.data.data;

  const title = articleData.title?.trim();
  if (!title) {
    return undefined;
  }

  const author =
    articleData.author?.name?.trim() ||
    articleData.author_name?.trim() ||
    undefined;

  const image =
    normalizeImageUrl(articleData.banner_url) ??
    normalizeImageUrl(articleData.image_urls?.[0]);

  const datePublished =
    toIsoDateFromSeconds(articleData.publish_time) ??
    toIsoDateFromSeconds(articleData.ctime);
  const dateModified = toIsoDateFromSeconds(articleData.mtime);

  const normalizedContentHtml = normalizeArticleContentHtml(
    articleData.content,
  );

  const description =
    truncateText(articleData.summary, 280) ||
    truncateText(toPlainTextFromHtml(normalizedContentHtml), 280);

  const bodyHtml =
    normalizedContentHtml || htmlParagraphsFromPlainText(articleData.summary);

  const readableContentHtml = renderArticleHtml({
    title,
    author,
    datePublished,
    image,
    bodyHtml,
  });

  return metadataWithDefaults({
    title,
    description,
    image,
    author,
    datePublished,
    dateModified,
    readableContentHtml,
  });
}

// Opus detail can point to article content (`comment_type=12` or fallback type=2).
function extractArticleIdFromOpusPayload(
  payload: z.infer<typeof opusDetailResponseSchema>,
): string | undefined {
  const fallbackType = payload.data?.fallback?.type;
  const fallbackId = toNumericString(payload.data?.fallback?.id);

  if (fallbackId && fallbackType === 2) {
    return fallbackId;
  }

  const basic = payload.data?.item?.basic;
  if (!basic) {
    return undefined;
  }

  if (basic.comment_type === 12) {
    const rid = toNumericString(basic.rid_str);
    if (rid) {
      return rid;
    }
  }

  return undefined;
}

// Resolve dynamic/opus content using a public-endpoint fallback chain:
// 1) `v1/opus/detail` (best structure)
// 2) `v1/detail` (parameterized web detail)
// 3) `desktop/v1/detail` (cookie-assisted fallback)
// 4) article retry if payload indicates article target
async function resolveDynamicMetadata(
  target: Extract<BilibiliTarget, { kind: "dynamic" }>,
): Promise<BilibiliMetadata | undefined> {
  const logPrefix = `[MetascraperBilibili][dynamic:${target.dynamicId}]`;

  // Preferred path: opus/detail with WBI2 + WBI.
  logger.info(`${logPrefix} Trying opus/detail`);
  const opusResponseEnvelope = await requestBilibiliApi(
    "/x/polymer/web-dynamic/v1/opus/detail",
    {
      id: target.dynamicId,
      timezone_offset: -480,
      features: BILIBILI_DYNAMIC_OPUS_FEATURES,
    },
    {
      withWbi: true,
      withWbi2: true,
      retryAttempts: 3,
    },
  );

  const opusParsed = opusDetailResponseSchema.safeParse(opusResponseEnvelope);

  if (opusParsed.success && opusParsed.data.code === 0) {
    logger.info(`${logPrefix} opus/detail responded with code=0`);
    const articleId = extractArticleIdFromOpusPayload(opusParsed.data);
    if (articleId) {
      logger.info(
        `${logPrefix} opus/detail points to article id=${articleId}, trying article/view`,
      );
      const articleMetadata = await resolveArticleById(articleId);
      if (articleMetadata) {
        logger.info(`${logPrefix} Resolved via opus->article/view`);
        return articleMetadata;
      }
      logger.info(
        `${logPrefix} opus->article/view did not return metadata, continue dynamic chain`,
      );
    }

    const opusParseResult = parseOpusItem(opusParsed.data.data?.item);
    if (opusParseResult) {
      const resolvedTitle =
        opusParseResult.title?.trim() ||
        buildDynamicFallbackTitle(
          opusParseResult.author,
          opusParseResult.description,
        );

      const readableContentHtml = renderDynamicHtml({
        title: resolvedTitle,
        author: opusParseResult.author,
        datePublished: opusParseResult.datePublished,
        image: opusParseResult.image,
        bodyHtml: opusParseResult.bodyHtml,
        statsText: opusParseResult.statsText,
      });

      return metadataWithDefaults({
        title: resolvedTitle,
        description: opusParseResult.description,
        image: opusParseResult.image,
        author: opusParseResult.author,
        datePublished: opusParseResult.datePublished,
        readableContentHtml,
      });
    }

    logger.info(
      `${logPrefix} opus/detail success but parser produced no readable item, continue fallback`,
    );
  } else {
    const apiCode =
      opusResponseEnvelope && "code" in opusResponseEnvelope
        ? String(opusResponseEnvelope.code)
        : "n/a";
    logger.info(
      `${logPrefix} opus/detail unavailable (schema=${opusParsed.success ? "ok" : "invalid"}, code=${apiCode}), continue fallback`,
    );
  }

  // Secondary path: web dynamic detail with parameterized request shape.
  logger.info(`${logPrefix} Trying web-dynamic v1/detail`);
  const webDynamicResponseEnvelope = await requestBilibiliApi(
    "/x/polymer/web-dynamic/v1/detail",
    {
      id: target.dynamicId,
      timezone_offset: -480,
      platform: "web",
      gaia_source: "main_web",
      features: BILIBILI_DYNAMIC_WEB_FEATURES,
      web_location: BILIBILI_DYNAMIC_WEB_LOCATION,
      "x-bili-device-req-json": BILIBILI_DYNAMIC_DEVICE_REQ_JSON,
      "x-bili-web-req-json": BILIBILI_DYNAMIC_WEB_REQ_JSON,
    },
    {
      withWbi: true,
      withWbi2: true,
      retryAttempts: 3,
    },
  );

  const webDynamicItem = extractDynamicItemFromEnvelope(
    webDynamicResponseEnvelope,
  );
  const webDynamicResult = parseDesktopDynamicItem(webDynamicItem);
  if (webDynamicResult) {
    logger.info(
      `${logPrefix} Resolved via v1/detail (explicitTitle=${webDynamicResult.title ? "yes" : "no"})`,
    );
    return buildDynamicMetadataFromParseResult(webDynamicResult);
  }

  const webDynamicCode =
    webDynamicResponseEnvelope && "code" in webDynamicResponseEnvelope
      ? String(webDynamicResponseEnvelope.code)
      : "n/a";
  logger.info(
    `${logPrefix} v1/detail did not produce parseable item (code=${webDynamicCode}), trying desktop fallback`,
  );

  // Final metadata fallback path: desktop dynamic detail with lightweight cookie identity.
  logger.info(`${logPrefix} Trying desktop/v1/detail`);
  const desktopResponseEnvelope = await requestBilibiliApi(
    "/x/polymer/web-dynamic/desktop/v1/detail",
    {
      id: target.dynamicId,
      build: BILIBILI_DESKTOP_BUILD,
    },
    {
      useDesktopCookie: true,
      retryAttempts: 2,
    },
  );

  const desktopDynamicItem = extractDynamicItemFromEnvelope(
    desktopResponseEnvelope,
  );
  const desktopResult = parseDesktopDynamicItem(desktopDynamicItem);
  if (desktopResult) {
    logger.info(
      `${logPrefix} Resolved via desktop/v1/detail (explicitTitle=${desktopResult.title ? "yes" : "no"})`,
    );
    return buildDynamicMetadataFromParseResult(desktopResult);
  }

  const desktopCode =
    desktopResponseEnvelope && "code" in desktopResponseEnvelope
      ? String(desktopResponseEnvelope.code)
      : "n/a";
  logger.info(
    `${logPrefix} desktop/v1/detail did not produce parseable item (code=${desktopCode})`,
  );

  // Last path before giving up: legacy dynamic_svr endpoint can still expose
  // basic author/text on some high-risk pages where modern endpoints fail.
  logger.info(`${logPrefix} Trying legacy dynamic_svr/detail fallback`);
  const legacyMetadata = await resolveLegacyDynamicMetadata(target.dynamicId);
  if (legacyMetadata) {
    logger.info(
      `${logPrefix} Resolved via legacy dynamic_svr/detail fallback (author=${legacyMetadata.author ? "yes" : "no"})`,
    );
    return legacyMetadata;
  }

  // Final fallback: if opus payload points to an article, retry as article.
  if (opusParsed.success && opusParsed.data.code === 0) {
    const articleId = extractArticleIdFromOpusPayload(opusParsed.data);
    if (articleId) {
      logger.info(
        `${logPrefix} Final fallback via article/view id=${articleId}`,
      );
      return resolveArticleById(articleId);
    }
  }

  logger.info(`${logPrefix} No dynamic metadata resolved`);
  return undefined;
}

// Main dispatcher: route URL target type to specific resolver.
async function resolveBilibiliMetadata(
  url: string,
): Promise<BilibiliMetadata | undefined> {
  const target = parseBilibiliTarget(url);
  if (!target) {
    return undefined;
  }

  switch (target.kind) {
    case "video":
      return resolveVideoMetadata(target);
    case "article":
      return resolveArticleById(target.cvid);
    case "dynamic":
      return resolveDynamicMetadata(target);
    default:
      return undefined;
  }
}

// Shared metadata entrypoint for rule resolvers with short TTL memoization.
async function getBilibiliMetadata(
  url: string,
): Promise<BilibiliMetadata | undefined> {
  const now = Date.now();
  purgeExpiredMetadataCache(now);

  // Promise-level memoization avoids duplicate API requests across rule fields.
  const cached = metadataCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  logger.info(`[MetascraperBilibili] Resolving metadata for ${url}`);
  const promise = resolveBilibiliMetadata(url).catch((error) => {
    logger.warn(
      `[MetascraperBilibili] Failed to resolve metadata for ${url}`,
      error,
    );
    return undefined;
  });

  metadataCache.set(url, {
    promise,
    expiresAt: now + METADATA_CACHE_TTL_MS,
  });

  return promise;
}

// metascraper route gate: run this plugin only for recognized Bilibili URLs.
const test = ({ url }: { url: string }): boolean =>
  parseBilibiliTarget(url) !== null;

// metascraper plugin interface:
// each rule reads from the same cached resolver result to avoid duplicate API calls.
const metascraperBilibili = () => {
  const rules: Rules = {
    pkgName: "metascraper-bilibili",
    test,
    title: (async ({ url, htmlDom }: { url: string; htmlDom: CheerioAPI }) => {
      const isCaptchaPage = isBilibiliRiskCaptchaPage(htmlDom);
      const metadata = await getBilibiliMetadata(url);
      if (metadata?.title?.trim()) {
        return metadata.title;
      }
      // Avoid storing risk-page "验证码" titles when the page is a captcha challenge.
      if (!isCaptchaPage) {
        const fallbackFromHtml = extractTitleFromHtmlDom(htmlDom);
        if (fallbackFromHtml) {
          logger.info(
            `[MetascraperBilibili] Title fallback from HTML for ${url}: "${fallbackFromHtml}"`,
          );
          return fallbackFromHtml;
        }
      }
      const defaultTitle = getDefaultTitleForTarget(url);
      logger.info(
        `[MetascraperBilibili] Title fallback to default for ${url}: "${defaultTitle ?? ""}" (captchaPage=${isCaptchaPage ? "yes" : "no"})`,
      );
      return defaultTitle;
    }) as unknown as RulesOptions,
    description: (async ({ url }: { url: string }) => {
      const metadata = await getBilibiliMetadata(url);
      return metadata?.description;
    }) as unknown as RulesOptions,
    image: (async ({ url }: { url: string }) => {
      const metadata = await getBilibiliMetadata(url);
      return metadata?.image;
    }) as unknown as RulesOptions,
    author: (async ({ url }: { url: string }) => {
      const metadata = await getBilibiliMetadata(url);
      return metadata?.author;
    }) as unknown as RulesOptions,
    publisher: (async ({ url }: { url: string }) => {
      const metadata = await getBilibiliMetadata(url);
      return metadata?.publisher;
    }) as unknown as RulesOptions,
    datePublished: (async ({ url }: { url: string }) => {
      const metadata = await getBilibiliMetadata(url);
      return metadata?.datePublished;
    }) as unknown as RulesOptions,
    dateModified: (async ({ url }: { url: string }) => {
      const metadata = await getBilibiliMetadata(url);
      return metadata?.dateModified;
    }) as unknown as RulesOptions,
    readableContentHtml: (async ({ url }: { url: string }) => {
      const metadata = await getBilibiliMetadata(url);
      return metadata?.readableContentHtml;
    }) as unknown as RulesOptions,
    logo: (async ({ url }: { url: string }) => {
      const metadata = await getBilibiliMetadata(url);
      return metadata?.logo;
    }) as unknown as RulesOptions,
  };

  return rules;
};

export default metascraperBilibili;
