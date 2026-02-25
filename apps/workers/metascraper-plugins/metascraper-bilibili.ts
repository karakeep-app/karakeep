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
const BILIBILI_PUBLISHER = "Bilibili";
const BILIBILI_FAVICON = "https://www.bilibili.com/favicon.ico";
const BILIBILI_DESKTOP_BUILD = "11605";
const BILIBILI_API_REQUEST_TIMEOUT_MS = 7000;

const BILIBILI_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  referer: "https://www.bilibili.com/",
} as const;

const METADATA_CACHE_TTL_MS = 60 * 1000;
const WBI_MIXIN_KEY_TTL_MS = 10 * 60 * 1000;

const RETRYABLE_API_CODES = new Set([-352, -403]);

const WBI_MIXIN_KEY_INDEX_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
] as const;

const apiEnvelopeSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.unknown().optional(),
  result: z.unknown().optional(),
});

const navResponseSchema = z.object({
  code: z.number(),
  data: z.object({
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

const desktopDynamicResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z
    .object({
      item: z
        .object({
          type: z.string().optional(),
          basic: z
            .object({
              rid_str: z.union([z.string(), z.number()]).optional(),
              rtype: z.number().optional(),
            })
            .optional(),
          modules: z.array(z.record(z.unknown())).optional(),
        })
        .optional(),
    })
    .optional(),
});

type ApiEnvelope = z.infer<typeof apiEnvelopeSchema>;
type OpusItem = NonNullable<
  NonNullable<z.infer<typeof opusDetailResponseSchema>["data"]>["item"]
>;
type DesktopDynamicItem = NonNullable<
  NonNullable<z.infer<typeof desktopDynamicResponseSchema>["data"]>["item"]
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

const metadataCache = new Map<string, CacheEntry>();
let wbiMixinKeyCache: WbiMixinKeyCache | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function backoffDelay(attempt: number): number {
  const base = 250;
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(base * 2 ** attempt + jitter, 4000);
}

function purgeExpiredMetadataCache(now: number): void {
  for (const [key, entry] of metadataCache.entries()) {
    if (entry.expiresAt <= now) {
      metadataCache.delete(key);
    }
  }
}

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
    .replace(/\s*[_-]\s*哔哩哔哩(?:_bilibili)?$/i, "")
    .replace(/\s*\|\s*哔哩哔哩(?:_bilibili)?$/i, "")
    .replace(/\s*-\s*哔哩哔哩(?:_bilibili)?$/i, "")
    .trim();

  return normalized || undefined;
}

function isCaptchaLikeTitle(title: string | undefined): boolean {
  if (!title) {
    return false;
  }
  return /^(验证码|verification code|captcha)$/i.test(title.trim());
}

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

function getDefaultTitleForTarget(url: string): string | undefined {
  const target = parseBilibiliTarget(url);
  if (!target) {
    return undefined;
  }

  if (target.kind === "video") {
    return "Bilibili 视频";
  }
  if (target.kind === "article") {
    return "Bilibili 专栏";
  }
  return "Bilibili 动态";
}

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

function formatCount(value: number | undefined): string | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return value.toLocaleString("en-US");
}

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
 */
function parseBilibiliTarget(url: string): BilibiliTarget | null {
  try {
    const parsedUrl = new URL(url);
    if (!isBilibiliHost(parsedUrl.hostname)) {
      return null;
    }

    const pathname = parsedUrl.pathname;

    const cvFromRead = extractFirstMatch(pathname, /\/read\/cv(\d+)/i);
    if (cvFromRead) {
      return { kind: "article", cvid: cvFromRead };
    }

    const cvFromMobilePath = extractFirstMatch(
      pathname,
      /\/read\/mobile\/(\d+)/i,
    );
    if (cvFromMobilePath) {
      return { kind: "article", cvid: cvFromMobilePath };
    }

    if (pathname.startsWith("/read/mobile")) {
      const cvid = toNumericString(
        parsedUrl.searchParams.get("id") ?? undefined,
      );
      if (cvid) {
        return { kind: "article", cvid };
      }
    }

    const opusId = extractFirstMatch(pathname, /\/opus\/(\d+)/i);
    if (opusId) {
      return { kind: "dynamic", dynamicId: opusId };
    }

    const h5DynamicId = extractFirstMatch(
      pathname,
      /\/h5\/dynamic\/detail\/(\d+)/i,
    );
    if (h5DynamicId) {
      return { kind: "dynamic", dynamicId: h5DynamicId };
    }

    if (parsedUrl.hostname.toLowerCase() === "t.bilibili.com") {
      const tDynamicId = extractFirstMatch(pathname, /^\/(\d+)/);
      if (tDynamicId) {
        return { kind: "dynamic", dynamicId: tDynamicId };
      }
    }

    const bvidFromVideo = extractFirstMatch(
      pathname,
      /\/video\/(BV[0-9A-Za-z]{10})/i,
    );
    if (bvidFromVideo) {
      return { kind: "video", bvid: bvidFromVideo };
    }

    const aidFromVideo = extractFirstMatch(pathname, /\/video\/av(\d+)/i);
    if (aidFromVideo) {
      return { kind: "video", aid: aidFromVideo };
    }

    const bangumiMatch = pathname.match(/\/bangumi\/play\/(ep|ss)(\d+)/i);
    if (bangumiMatch) {
      const [, prefix, id] = bangumiMatch;
      if (prefix.toLowerCase() === "ep") {
        return { kind: "video", epId: id };
      }
      return { kind: "video", seasonId: id };
    }

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

function buildApiUrl(
  path: string,
  params: Record<string, string | number>,
): string {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  return `${BILIBILI_API_BASE}${path}?${query.toString()}`;
}

function parseApiEnvelope(payload: unknown): ApiEnvelope | undefined {
  const parsed = apiEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
}

function getFilenameWithoutExtension(url: string): string {
  const fileName = url.split("/").pop() ?? "";
  const dotIndex = fileName.indexOf(".");
  if (dotIndex === -1) {
    return fileName;
  }
  return fileName.slice(0, dotIndex);
}

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

    if (!parsed.success || parsed.data.code !== 0) {
      logger.warn(
        "[MetascraperBilibili] Failed to parse nav response for WBI key",
      );
      return undefined;
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
      let requestParams = normalizeParams(params);

      if (options.withWbi2) {
        requestParams = {
          ...requestParams,
          ...buildWbi2Params(),
        };
      }

      if (options.withWbi) {
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
      )}" alt="${escapeHtml(title)}" loading="lazy" /></figure>`
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
        )}" class="kk-bili-emoji" />`,
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
    items.push(`转发 ${forward}`);
  }

  const comment = getCount("comment");
  if (comment) {
    items.push(`评论 ${comment}`);
  }

  const like = getCount("like");
  if (like) {
    items.push(`点赞 ${like}`);
  }

  return items.length > 0 ? items.join(" · ") : undefined;
}

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
              )}" alt="bilibili image" loading="lazy" /></figure>`,
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

function createDesktopCollector(): DesktopCollector {
  return {
    texts: [],
    textSet: new Set<string>(),
    images: [],
    imageSet: new Set<string>(),
    cards: [],
  };
}

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

function isLikelyImageFieldName(key: string): boolean {
  return (
    key === "src" ||
    key === "url" ||
    key === "cover" ||
    key === "first_pic" ||
    key === "image_url"
  );
}

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

  collector.cards.push({
    title: normalizedTitle,
    url: normalizeLinkUrl(jumpUrl),
    cover: normalizeImageUrl(cover),
    description: description?.trim() || undefined,
  });
}

function collectDesktopDynamic(
  collector: DesktopCollector,
  value: unknown,
  depth = 0,
): void {
  // Guard against unusually deep nested payloads.
  if (depth > 6) {
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

    if ("modules" in field && Array.isArray(field.modules)) {
      collectDesktopDynamic(collector, field.modules, depth + 1);
    }

    collectDesktopDynamic(collector, field, depth + 1);
  }
}

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
    parts.push(`转发 ${forward}`);
  }

  const comment = getCount("comment");
  if (comment) {
    parts.push(`评论 ${comment}`);
  }

  const like = getCount("like");
  if (like) {
    parts.push(`点赞 ${like}`);
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function parseDesktopDynamicItem(
  item: DesktopDynamicItem | undefined,
): DesktopParseResult | undefined {
  if (!item) {
    return undefined;
  }

  const collector = createDesktopCollector();

  let author: string | undefined;
  let datePublished: string | undefined;
  let statsText: string | undefined;
  let explicitTitle: string | undefined;
  let explicitDescription: string | undefined;

  for (const module of item.modules ?? []) {
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

    if ("module_dynamic" in module) {
      collectDesktopDynamic(collector, module.module_dynamic);
    }

    if ("module_stat" in module) {
      statsText = extractDesktopStats(module.module_stat) ?? statsText;
    }
  }

  const description =
    truncateText(explicitDescription, 280) ??
    truncateText(collector.texts[0], 280);

  // Only keep explicit dynamic title for metadata to avoid promoting linked-card
  // titles as the bookmark title.
  const title = explicitTitle;

  const image = collector.images[0];

  const blocks: string[] = [];
  if (collector.texts.length > 0) {
    blocks.push(
      ...collector.texts.map(
        (text) => `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`,
      ),
    );
  }

  if (collector.images.length > 0) {
    blocks.push(
      ...collector.images.map(
        (imageUrl) =>
          `<figure><img src="${escapeHtml(
            imageUrl,
          )}" alt="bilibili image" loading="lazy" /></figure>`,
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
            )}" loading="lazy" />`,
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

  return {
    title,
    author,
    datePublished,
    description,
    image,
    bodyHtml: blocks.join("\n") || htmlParagraphsFromPlainText(description),
    statsText,
  };
}

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
      ["播放", input.stats.view],
      ["弹幕", input.stats.danmaku],
      ["评论", input.stats.reply],
      ["点赞", input.stats.like],
      ["收藏", input.stats.favorite],
      ["投币", input.stats.coin],
      ["分享", input.stats.share],
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
    readableContentHtml,
  });
}

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

async function resolveDynamicMetadata(
  target: Extract<BilibiliTarget, { kind: "dynamic" }>,
): Promise<BilibiliMetadata | undefined> {
  // Preferred path: opus/detail with WBI2 + WBI.
  const opusResponseEnvelope = await requestBilibiliApi(
    "/x/polymer/web-dynamic/v1/opus/detail",
    {
      id: target.dynamicId,
      timezone_offset: -480,
      features:
        "itemOpusStyle,onlyfansVote,onlyfansAssetsV2,decorationCard,htmlNewStyle,ugcDelete,editable,opusPrivateVisible",
    },
    {
      withWbi: true,
      withWbi2: true,
      retryAttempts: 3,
    },
  );

  const opusParsed = opusDetailResponseSchema.safeParse(opusResponseEnvelope);

  if (opusParsed.success && opusParsed.data.code === 0) {
    const articleId = extractArticleIdFromOpusPayload(opusParsed.data);
    if (articleId) {
      const articleMetadata = await resolveArticleById(articleId);
      if (articleMetadata) {
        return articleMetadata;
      }
    }

    const opusParseResult = parseOpusItem(opusParsed.data.data?.item);
    if (opusParseResult) {
      const metadataTitle = opusParseResult.title?.trim() || undefined;
      const contentTitle = metadataTitle ?? "Bilibili 动态";

      const readableContentHtml = renderDynamicHtml({
        title: contentTitle,
        author: opusParseResult.author,
        datePublished: opusParseResult.datePublished,
        image: opusParseResult.image,
        bodyHtml: opusParseResult.bodyHtml,
        statsText: opusParseResult.statsText,
      });

      return metadataWithDefaults({
        title: metadataTitle,
        description: opusParseResult.description,
        image: opusParseResult.image,
        author: opusParseResult.author,
        datePublished: opusParseResult.datePublished,
        readableContentHtml,
      });
    }
  }

  // Fallback path: desktop dynamic detail with lightweight cookie identity.
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

  const desktopParsed = desktopDynamicResponseSchema.safeParse(
    desktopResponseEnvelope,
  );

  if (desktopParsed.success && desktopParsed.data.code === 0) {
    const desktopResult = parseDesktopDynamicItem(
      desktopParsed.data.data?.item,
    );
    if (desktopResult) {
      const titleForContent = desktopResult.title ?? "Bilibili 动态";
      const readableContentHtml = renderDynamicHtml({
        title: titleForContent,
        author: desktopResult.author,
        datePublished: desktopResult.datePublished,
        image: desktopResult.image,
        bodyHtml: desktopResult.bodyHtml,
        statsText: desktopResult.statsText,
      });

      return metadataWithDefaults({
        title: desktopResult.title,
        description: desktopResult.description,
        image: desktopResult.image,
        author: desktopResult.author,
        datePublished: desktopResult.datePublished,
        readableContentHtml,
      });
    }
  }

  // Final fallback: if opus payload points to an article, retry as article.
  if (opusParsed.success && opusParsed.data.code === 0) {
    const articleId = extractArticleIdFromOpusPayload(opusParsed.data);
    if (articleId) {
      return resolveArticleById(articleId);
    }
  }

  return undefined;
}

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

const test = ({ url }: { url: string }): boolean =>
  parseBilibiliTarget(url) !== null;

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
          return fallbackFromHtml;
        }
      }
      return getDefaultTitleForTarget(url);
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
