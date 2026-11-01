import type { CheerioAPI } from "cheerio";
import { load } from "cheerio";
import type { Rules, RulesOptions } from "metascraper";
import { decode as decodeHtmlEntities } from "html-entities";
import { fetchWithProxy } from "network";
import { z } from "zod";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

/**
 * This is a metascraper plugin to select a better
 * 'image' attribute for Reddit links, specifically
 * those sharing images. It will also extract the
 * Post Title for a Reddit post instead of use the
 * default.
 *
 * As of writing this, Reddit posts do not define
 * an open-graph image (og:image) attribute, so
 * metascraper resorts to looking for images in
 * the HTML DOM, and selects the first one.
 *
 * In Reddit posts, the first image is typically
 * the profile picture of the OP, which Karakeep
 * is using for the thumbnail.
 *
 * This metascraper plugin instead looks for images
 * with the domain i.redd.it, on which Reddit hosts
 * their preview images for posts. If this plugin
 * finds an i.redd.it image, it provides that for
 * the image metadata.
 *
 * If there is not a matching image, this plugin
 * will return 'undefined' and the next plugin
 * should continue to attempt to extract images.
 *
 * Post data (title, author, body, top comments, image)
 * comes from, in order: the Reddit OAuth JSON API (when
 * REDDIT_CLIENT_ID/SECRET are configured), the
 * <shreddit-post> markup in the crawled page, or an
 * anonymous fetch of the rendered post page (solving
 * Reddit's JS challenge). Reddit blocks the anonymous
 * '.json' endpoints, so those are not used.
 **/

const redditPreviewImageSchema = z.object({
  source: z.object({ url: z.string().optional() }).optional(),
  resolutions: z.array(z.object({ url: z.string().optional() })).optional(),
});

const redditMediaMetadataItemSchema = z.object({
  s: z.object({ u: z.string().optional() }).optional(),
  p: z.array(z.object({ u: z.string().optional() })).optional(),
});

const redditPostSchema = z.object({
  title: z.string().optional(),
  preview: z
    .object({ images: z.array(redditPreviewImageSchema).optional() })
    .optional(),
  url_overridden_by_dest: z.string().optional(),
  url: z.string().optional(),
  thumbnail: z.string().optional(),
  media_metadata: z
    .record(z.string(), redditMediaMetadataItemSchema)
    .optional(),
  author: z.string().optional(),
  created_utc: z.number().optional(),
  selftext: z.string().nullish(),
  selftext_html: z.string().nullish(),
  subreddit_name_prefixed: z.string().optional(),
});

type RedditPostData = z.infer<typeof redditPostSchema>;

// Comment children (kind "t1") carry different fields than the post; extend the
// post schema (all-optional) so a single schema parses both listings.
const redditChildDataSchema = redditPostSchema.extend({
  body: z.string().nullish(),
  body_html: z.string().nullish(),
  score: z.number().nullish(),
});

const redditResponseSchema = z.array(
  z.object({
    data: z.object({
      children: z
        .array(
          z.object({
            kind: z.string().optional(),
            data: redditChildDataSchema,
          }),
        )
        .optional(),
    }),
  }),
);

interface RedditComment {
  author?: string;
  // Plain text of the comment.
  body?: string;
  // Ready-to-use HTML of the comment (already entity-decoded).
  bodyHtml?: string;
  score: number;
}

interface ShredditExtraction {
  title?: string;
  author?: string;
  subredditPrefixed?: string;
  createdUtc?: number;
  bodyHtml: string;
  image?: string;
  comments: RedditComment[];
}

interface RedditFetchResult {
  fetched: boolean;
  post?: RedditPostData;
  // Ready-to-use HTML of the post body (already entity-decoded).
  bodyHtml?: string;
  // Image taken from the rendered page; the OAuth JSON path derives it from post.
  image?: string;
  comments?: RedditComment[];
}

const REDDIT_CACHE_TTL_MS = 60 * 1000; // 1 minute TTL to avoid stale data

interface RedditCacheEntry {
  expiresAt: number;
  promise: Promise<RedditFetchResult>;
}

const redditJsonCache = new Map<string, RedditCacheEntry>();

const purgeExpiredCacheEntries = (now: number) => {
  for (const [key, entry] of redditJsonCache.entries()) {
    if (entry.expiresAt <= now) {
      redditJsonCache.delete(key);
    }
  }
};

const decodeRedditUrl = (url?: string): string | undefined => {
  if (!url) {
    return undefined;
  }
  const decoded = decodeHtmlEntities(url);
  return decoded || undefined;
};

let redditAccessToken: string | null = null;
let redditAccessTokenExpiresAt = 0;
let redditAccessTokenPromise: Promise<string | null> | null = null;

const getRedditAccessToken = async (): Promise<string | null> => {
  const { clientId, clientSecret } = serverConfig.reddit;
  if (!clientId || !clientSecret) {
    return null;
  }

  const now = Date.now();
  if (redditAccessToken && redditAccessTokenExpiresAt > now) {
    return redditAccessToken;
  }

  if (redditAccessTokenPromise) {
    return redditAccessTokenPromise;
  }

  redditAccessTokenPromise = (async () => {
    try {
      const response = await fetchWithProxy(
        "https://www.reddit.com/api/v1/access_token",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
            "User-Agent": "KarakeepBot/1.0",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        },
      );

      if (!response.ok) {
        logger.warn(
          `[MetascraperReddit] Failed to obtain access token: ${response.status}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };
      if (!data.access_token) {
        return null;
      }

      redditAccessToken = data.access_token;
      // Expire 5 minutes before the actual expiration to be safe
      redditAccessTokenExpiresAt =
        now + Math.max(0, data.expires_in - 300) * 1000;
      return redditAccessToken;
    } catch (error) {
      logger.warn("[MetascraperReddit] Error obtaining access token", error);
      return null;
    } finally {
      redditAccessTokenPromise = null;
    }
  })();

  return redditAccessTokenPromise;
};

// Always request the post itself (not the bookmarked permalink), so a comment
// permalink returns the same post + top-level top comments as the post URL.
// raw_json is deliberately not set: selftext_html/body_html stay entity-encoded
// and are decoded once when the response is parsed.
const buildOauthJsonUrl = (postId: string): string =>
  `https://oauth.reddit.com/comments/${postId}.json?sort=top&limit=25&depth=1`;

// Anonymous Reddit crawling (no OAuth credentials): Reddit serves a lightweight
// "please wait" JS challenge to cold requests. The page embeds
// (async e=>e+e)("<seed>") so the solution is just the seed repeated twice.
// Submitting the hidden form (GET) answers with a 301 to the canonical URL and
// sets the clearance cookies (token_v2, loid, ...) on that redirect hop. Only
// the final, rendered page has the content, so cookies must be captured from
// every hop. Implemented against fetchWithProxy (node-fetch, no cookie jar) in
// manual-redirect mode so each hop still goes through its SSRF validation.
// Technique: https://gist.github.com/Richard-Weiss/00b9cfdbd8d94ab22430d8859587db5d
const REDDIT_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0";
const REDDIT_HTML_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const MAX_REDDIT_HOPS = 5;

type FetchResponse = Awaited<ReturnType<typeof fetchWithProxy>>;
type CookieJar = Map<string, string>;

const storeSetCookies = (response: FetchResponse, jar: CookieJar): void => {
  const headers = response.headers as unknown as {
    raw?: () => Record<string, string[]>;
  };
  const list =
    typeof headers.raw === "function"
      ? (headers.raw()["set-cookie"] ?? [])
      : [];
  for (const setCookie of list) {
    const [pair, ...attributes] = setCookie.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attributes.some(
      (attribute) => attribute.trim().toLowerCase() === "max-age=0",
    );
    if (!value || expired) {
      // Reddit deletes cookies (e.g. `theme`) by sending them back empty.
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
};

const cookieHeader = (jar: CookieJar): string =>
  Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

const isRedirectStatus = (status: number): boolean =>
  status === 301 ||
  status === 302 ||
  status === 303 ||
  status === 307 ||
  status === 308;

const isRedditHost = (hostname: string): boolean =>
  hostname === "reddit.com" || hostname.endsWith(".reddit.com");

// GET with a browser-like fingerprint, following redirects manually so that
// Set-Cookie headers from intermediate hops are captured and replayed.
// Redirects off reddit.com are not followed (the redirect response is returned)
// so the cookie jar never leaks to another site. With `omitCookiesOnFirstHop`
// the first request is sent without a Cookie header (later hops use the jar).
const browserGet = async (
  url: string,
  accept: string,
  jar: CookieJar,
  { omitCookiesOnFirstHop = false }: { omitCookiesOnFirstHop?: boolean } = {},
): Promise<FetchResponse> => {
  let currentUrl = url;
  for (let hop = 0; ; hop++) {
    const headers: Record<string, string> = {
      "User-Agent": REDDIT_BROWSER_UA,
      Accept: accept,
      "Accept-Language": "en-US,en;q=0.5",
    };
    const cookie = cookieHeader(jar);
    if (cookie && !(omitCookiesOnFirstHop && hop === 0)) {
      headers["Cookie"] = cookie;
    }
    const response = await fetchWithProxy(currentUrl, {
      headers,
      redirect: "manual",
    });
    storeSetCookies(response, jar);

    const location = response.headers.get("location");
    if (!isRedirectStatus(response.status) || !location) {
      return response;
    }
    const nextUrl = new URL(location, currentUrl);
    if (hop >= MAX_REDDIT_HOPS || !isRedditHost(nextUrl.hostname)) {
      return response;
    }
    // Release the connection before following the redirect.
    await response.text().catch(() => undefined);
    currentUrl = nextUrl.toString();
  }
};

interface RedditChallenge {
  submitUrl: string;
}

// Parses the JS challenge page. Reddit renamed the hidden token field from
// `token` to `jsc_token` (~2026-09), so accept either and send the token back
// under whichever name the form used.
export const parseRedditChallenge = (
  html: string,
  baseUrl = "https://www.reddit.com/",
): RedditChallenge | undefined => {
  const seed = /\(async\s*\(?(\w+)\)?\s*=>\s*\1\s*\+\s*\1\)\("([^"]+)"\)/.exec(
    html,
  );
  if (!seed) {
    return undefined;
  }
  const $ = load(html);
  const form = $("form")
    .filter((_, el) => $(el).find('input[name="js_challenge"]').length > 0)
    .first();
  const action = form.attr("action");
  const tokenInput = form
    .find('input[name="jsc_token"], input[name="token"]')
    .first();
  const tokenName = tokenInput.attr("name");
  const tokenValue = tokenInput.attr("value");
  if (!action || !tokenName || !tokenValue) {
    // Not a solvable challenge page (or the format changed).
    return undefined;
  }
  const params = new URLSearchParams({
    solution: seed[2] + seed[2],
    js_challenge: "1",
    [tokenName]: tokenValue,
    jsc_orig_r: form.find('input[name="jsc_orig_r"]').attr("value") ?? "",
  });
  // action may be a relative path, absolute URL, or protocol-relative URL;
  // resolve against the page URL so we never build a malformed submit URL.
  const submitUrl = new URL(action, baseUrl);
  submitUrl.search = params.toString();
  return { submitUrl: submitUrl.toString() };
};

// Submits the challenge form and returns the final response of the submit
// chain. The submit must carry NO Cookie header: the warmup response sets
// `edgebucket`, and echoing it back makes Reddit answer 403 instead of issuing
// token_v2. The submit either 301s to the canonical URL (cookies are set on
// that hop) or answers 200 directly with the cookies and the rendered page, so
// callers must handle both.
const solveRedditChallenge = async (
  html: string,
  jar: CookieJar,
  baseUrl?: string,
): Promise<FetchResponse | undefined> => {
  const challenge = parseRedditChallenge(html, baseUrl);
  if (!challenge) {
    return undefined;
  }
  try {
    return await browserGet(challenge.submitUrl, REDDIT_HTML_ACCEPT, jar, {
      omitCookiesOnFirstHop: true,
    });
  } catch (error) {
    logger.warn("[MetascraperReddit] Failed to submit Reddit challenge", error);
    return undefined;
  }
};

// Authenticated path (OAuth client credentials). Returns undefined when there
// are no credentials or the request did not succeed, in which case the caller
// falls back to anonymous crawling.
const fetchRedditOauthJson = async (
  postId: string,
  accessToken: string | null,
): Promise<FetchResponse | undefined> => {
  if (!accessToken) {
    return undefined;
  }
  const response = await fetchWithProxy(buildOauthJsonUrl(postId), {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "KarakeepBot/1.0",
    },
  });
  if (response.ok) {
    return response;
  }
  // Any non-OK OAuth response falls through to the anonymous path, which works
  // without credentials and may succeed even when OAuth does not (e.g. a 429
  // rate limit or a transient 5xx from oauth.reddit.com). Only drop the cached
  // token on an auth failure (401/403, i.e. revoked, early-expired, or
  // insufficient scope) - a rate limit or server error does not mean the token
  // is invalid, so keep it for later requests.
  logger.warn(
    `[MetascraperReddit] OAuth request failed (${response.status}); falling back to anonymous crawling`,
  );
  if (response.status === 401 || response.status === 403) {
    redditAccessToken = null;
    redditAccessTokenExpiresAt = 0;
  }
  return undefined;
};

const REDDIT_BLOCKED_MARKER = /blocked by network security/i;

// Returns the (lower-case) post id of a Reddit post URL (slug, slugless,
// comment permalink, with query or fragment), or undefined for any other URL
// (subreddit, profile, home feed, non-Reddit hosts, ...).
export const extractRedditPostId = (url: string): string | undefined => {
  try {
    const urlObj = new URL(url);
    if (!isRedditHost(urlObj.hostname)) {
      return undefined;
    }
    const match = /\/comments\/([a-z0-9]+)(?:\/|$)/i.exec(urlObj.pathname);
    return match ? match[1].toLowerCase() : undefined;
  } catch {
    return undefined;
  }
};

// Reduces any Reddit post URL to the canonical
// https://www.reddit.com/comments/<id>/ form. That URL redirects to the slug
// URL and works as the challenge target.
export const normalizeRedditPostUrl = (url: string): string | undefined => {
  const postId = extractRedditPostId(url);
  return postId ? `https://www.reddit.com/comments/${postId}/` : undefined;
};

// Fetches the rendered post page anonymously: GET (collecting cookies), solve
// the JS challenge if one is served, and return the HTML of the final page.
const fetchRedditPostHtml = async (
  postUrl: string,
): Promise<string | undefined> => {
  const jar: CookieJar = new Map();
  const warmup = await browserGet(postUrl, REDDIT_HTML_ACCEPT, jar);
  let html = await warmup.text();
  if (REDDIT_BLOCKED_MARKER.test(html)) {
    return undefined;
  }
  if (html.includes("<shreddit-post")) {
    return html;
  }

  const solved = await solveRedditChallenge(html, jar, postUrl);
  if (!solved) {
    return undefined;
  }
  html = await solved.text();
  if (REDDIT_BLOCKED_MARKER.test(html)) {
    return undefined;
  }
  if (!html.includes("<shreddit-post") && jar.size > 0) {
    // The submit did not land on the rendered page (e.g. it only set the
    // clearance cookies); request the page again with them.
    const page = await browserGet(postUrl, REDDIT_HTML_ACCEPT, jar);
    html = await page.text();
  }
  return html;
};

const extractImageFromMediaMetadata = (
  media_metadata?: RedditPostData["media_metadata"],
): string | undefined => {
  if (!media_metadata) {
    return undefined;
  }
  const firstItem = Object.values(media_metadata)[0];
  if (!firstItem) {
    return undefined;
  }

  return (
    decodeRedditUrl(firstItem.s?.u) ??
    decodeRedditUrl(firstItem.p?.[0]?.u) ??
    undefined
  );
};

const isRedditImageHost = (urlCandidate: string): boolean => {
  try {
    const hostname = new URL(urlCandidate).hostname;
    return hostname.includes("redd.it");
  } catch {
    return false;
  }
};

const extractImageFromPost = (post: RedditPostData): string | undefined => {
  const previewImage = post.preview?.images?.[0];
  const previewUrl =
    decodeRedditUrl(previewImage?.source?.url) ??
    decodeRedditUrl(previewImage?.resolutions?.[0]?.url);
  if (previewUrl) {
    return previewUrl;
  }

  const mediaUrl = extractImageFromMediaMetadata(post.media_metadata);
  if (mediaUrl) {
    return mediaUrl;
  }

  const directUrl =
    decodeRedditUrl(post.url_overridden_by_dest) ??
    decodeRedditUrl(post.url) ??
    decodeRedditUrl(post.thumbnail);

  if (directUrl && isRedditImageHost(directUrl)) {
    return directUrl;
  }

  return undefined;
};

const extractTitleFromPost = (post: RedditPostData): string | undefined =>
  post.title?.trim() || undefined;

const extractAuthorFromPost = (post: RedditPostData): string | undefined =>
  post.author?.trim() || undefined;

const extractDateFromPost = (post: RedditPostData): string | undefined => {
  if (!post.created_utc) {
    return undefined;
  }
  const date = new Date(post.created_utc * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const extractPublisherFromPost = (post: RedditPostData): string | undefined =>
  post.subreddit_name_prefixed?.trim() || "Reddit";

const REDDIT_LOGO_URL =
  "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png";

const fallbackDomImage = ({ htmlDom }: { htmlDom: CheerioAPI }) => {
  // 'preview' subdomain images are more likely to be what we're after
  // but it could be in the 'i' subdomain.
  // returns undefined if neither exists
  const previewImages = htmlDom('img[src*="preview.redd.it"]')
    .map((_, el) => htmlDom(el).attr("src"))
    .get();
  const iImages = htmlDom('img[src*="i.redd.it"]')
    .map((_, el) => htmlDom(el).attr("src"))
    .get();
  return previewImages[0] || iImages[0];
};

const fallbackDomTitle = ({ htmlDom }: { htmlDom: CheerioAPI }) => {
  const title: string | undefined = htmlDom("shreddit-title[title]")
    .first()
    .attr("title");
  const postTitle: string | undefined =
    title ?? htmlDom("shreddit-post[post-title]").first().attr("post-title");
  return postTitle ? postTitle.trim() : undefined;
};

// Number of top-level comments (by score) to fold into the readable content.
// Many Reddit posts have an empty body (link/discussion posts), so the useful
// context lives in the comments; including them gives the reader view and the
// tagger real content to work with. Output HTML is sanitized downstream.
const MAX_REDDIT_COMMENTS = 10;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// readableContentHtml is HTML, so a bare title like `vector<T>` must be
// escaped or the sanitiser would eat it as a tag.
const titleToHtml = (title?: string): string | undefined =>
  title ? `<p>${escapeHtml(title)}</p>` : undefined;

const buildCommentsHtml = (comments?: RedditComment[]): string => {
  if (!comments || comments.length === 0) {
    return "";
  }
  const top = [...comments]
    .filter((comment) => (comment.body ?? "").trim().length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_REDDIT_COMMENTS);
  if (top.length === 0) {
    return "";
  }
  const items = top
    .map((comment) => {
      // bodyHtml is ready-to-use HTML (decoded at the source). Fall back to the
      // plain body (escaped) if it is absent.
      const bodyHtml =
        comment.bodyHtml || `<p>${escapeHtml(comment.body ?? "")}</p>`;
      const author = escapeHtml(comment.author ?? "[deleted]");
      return `<div class="reddit-comment"><p><strong>u/${author}</strong> (${comment.score} points)</p>${bodyHtml}</div>`;
    })
    .join("");
  return `<hr /><h2>Top comments</h2>${items}`;
};

const cleanAttr = (value: string | undefined): string | undefined =>
  value?.trim() || undefined;

const extractImageFromShreddit = (
  $: CheerioAPI,
  post: ReturnType<CheerioAPI>,
): string | undefined => {
  const galleryImage = cleanAttr(
    post.find("gallery-carousel img.media-lightbox-img").first().attr("src"),
  );
  if (galleryImage) {
    return galleryImage;
  }

  const contentHref = cleanAttr(post.attr("content-href"));
  if (contentHref && isRedditImageHost(contentHref)) {
    return contentHref;
  }

  return post
    .find('img[src*="preview.redd.it"]')
    .map((_, el) => $(el).attr("src"))
    .get()
    .find((src) => src && !src.includes("snoovatar"));
};

// Extracts a post and its top-level comments from Reddit's rendered markup
// (<shreddit-post> / <shreddit-comment> web components). Bodies are already
// HTML, so they are not entity-decoded. Returns undefined when the page has no
// <shreddit-post> for the requested post (not a post page, a feed page showing
// other posts, challenge page, block page, ...).
export const extractFromShreddit = (
  $: CheerioAPI,
  postId: string,
): ShredditExtraction | undefined => {
  // Feed pages hold many shreddit-post elements; only the bookmarked post counts.
  const post = $("shreddit-post")
    .filter((_, el) => $(el).attr("id")?.toLowerCase() === `t3_${postId}`)
    .first();
  if (post.length === 0) {
    return undefined;
  }

  const subredditName = cleanAttr(post.attr("subreddit-name"));
  const createdAt = Date.parse(post.attr("created-timestamp") ?? "");

  const comments: RedditComment[] = [];
  $("shreddit-comment").each((_, el) => {
    const comment = $(el);
    if ((comment.attr("depth") ?? "0") !== "0") {
      return;
    }
    const thingId = comment.attr("thingid");
    const content = (
      thingId && /^[\w-]+$/.test(thingId)
        ? comment.find(`[id="${thingId}-post-rtjson-content"]`)
        : comment.find('[id^="t1_"][id$="-post-rtjson-content"]')
    ).first();
    const text = content.text().trim();
    if (!text) {
      return;
    }
    const score = Number.parseInt(comment.attr("score") ?? "", 10);
    comments.push({
      author: cleanAttr(comment.attr("author")),
      body: text,
      bodyHtml: content.html()?.trim() || undefined,
      score: Number.isNaN(score) ? 0 : score,
    });
  });

  return {
    title: cleanAttr(post.attr("post-title")),
    author: cleanAttr(post.attr("author")),
    subredditPrefixed:
      cleanAttr(post.attr("subreddit-prefixed-name")) ??
      (subredditName ? `r/${subredditName}` : undefined),
    createdUtc: Number.isNaN(createdAt) ? undefined : createdAt / 1000,
    bodyHtml:
      $(`[id="t3_${postId}-post-rtjson-content"]`).first().html()?.trim() ?? "",
    image: extractImageFromShreddit($, post),
    comments,
  };
};

const shredditToFetchResult = (
  data: ShredditExtraction,
): RedditFetchResult => ({
  fetched: true,
  post: {
    title: data.title,
    author: data.author,
    created_utc: data.createdUtc,
    subreddit_name_prefixed: data.subredditPrefixed,
  },
  bodyHtml: data.bodyHtml,
  image: data.image,
  comments: data.comments,
});

const fetchRedditOauthPostData = async (
  postId: string,
): Promise<RedditFetchResult | undefined> => {
  let response: FetchResponse | undefined;
  try {
    response = await fetchRedditOauthJson(postId, await getRedditAccessToken());
  } catch (error) {
    logger.warn(
      `[MetascraperReddit] Failed to fetch Reddit JSON for post ${postId}`,
      error,
    );
    return undefined;
  }
  if (!response) {
    return undefined;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    logger.warn(
      `[MetascraperReddit] Failed to parse Reddit JSON for post ${postId}`,
      error,
    );
    return undefined;
  }

  const parsed = redditResponseSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn(
      "[MetascraperReddit] Reddit JSON schema validation failed",
      parsed.error,
    );
    return undefined;
  }

  const firstListingWithChildren = parsed.data.find(
    (listing) => (listing.data.children?.length ?? 0) > 0,
  );
  const post = firstListingWithChildren?.data.children?.[0]?.data;

  // Top-level comments (kind "t1") live in the second listing. Nested
  // replies are under each comment's `replies`, so iterating the listings'
  // direct children yields only top-level comments, which is what we want.
  // Reddit's selftext_html/body_html are entity-encoded HTML; decode them here.
  const comments: RedditComment[] = parsed.data
    .flatMap((listing) => listing.data.children ?? [])
    .filter((child) => child.kind === "t1" && !!child.data.body)
    .map((child) => ({
      author: child.data.author ?? undefined,
      body: child.data.body ?? undefined,
      bodyHtml: child.data.body_html
        ? decodeHtmlEntities(child.data.body_html)
        : undefined,
      score: typeof child.data.score === "number" ? child.data.score : 0,
    }));

  return {
    fetched: true,
    post,
    bodyHtml: decodeHtmlEntities(post?.selftext_html ?? ""),
    comments,
  };
};

const fetchRedditPostData = async (
  url: string,
  htmlDom: CheerioAPI,
): Promise<RedditFetchResult> => {
  const postId = extractRedditPostId(url);
  if (!postId) {
    // Not a post URL (subreddit, profile, feed, ...): the page holds unrelated
    // posts, so leave it to the generic metascraper rules.
    return { fetched: false };
  }
  const postUrl = `https://www.reddit.com/comments/${postId}/`;
  const cacheKey = postId;
  const cached = redditJsonCache.get(cacheKey);
  const now = Date.now();

  purgeExpiredCacheEntries(now);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = (async (): Promise<RedditFetchResult> => {
    const oauthResult = await fetchRedditOauthPostData(postId);
    if (oauthResult) {
      return oauthResult;
    }

    // Anonymous: the browser-rendered page we already crawled may carry the
    // post, which needs no extra requests.
    const fromDom = extractFromShreddit(htmlDom, postId);
    if (fromDom) {
      return shredditToFetchResult(fromDom);
    }

    try {
      const html = await fetchRedditPostHtml(postUrl);
      const fromHtml = html
        ? extractFromShreddit(load(html), postId)
        : undefined;
      if (fromHtml) {
        return shredditToFetchResult(fromHtml);
      }
    } catch (error) {
      logger.warn(
        `[MetascraperReddit] Failed to fetch Reddit post page for ${url}`,
        error,
      );
    }
    return { fetched: false };
  })();

  redditJsonCache.set(cacheKey, {
    promise,
    expiresAt: now + REDDIT_CACHE_TTL_MS,
  });

  return promise;
};

const domainFromUrl = (url: string): string => {
  /**
   * First-party metascraper plugins import metascraper-helpers,
   * which exposes a parseUrl function from the tldtr package.
   * This function does similar to the 'domainWithoutSuffix'
   * field from the tldtr package, without requiring any
   * additional packages.
   **/
  try {
    // Create a URL instance to parse the hostname
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    // Return the part before the TLD (assuming at least two segments)
    // For example, "www.example.com" -> ["www", "example", "com"]
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return hostname;
  } catch (error) {
    logger.error(
      "[MetascraperReddit] Test>domainFromUrl received an invalid URL:",
      error,
    );
    return "";
  }
};

const test = ({ url }: { url: string }): boolean =>
  domainFromUrl(url).toLowerCase() === "reddit";

const metascraperReddit = () => {
  const rules: Rules = {
    pkgName: "metascraper-reddit",
    test,
    image: (async ({ url, htmlDom }: { url: string; htmlDom: CheerioAPI }) => {
      if (!extractRedditPostId(url)) {
        return undefined;
      }
      const result = await fetchRedditPostData(url, htmlDom);
      const redditImage =
        result.image ??
        (result.post ? extractImageFromPost(result.post) : undefined);
      if (redditImage) {
        return redditImage;
      }

      // If we successfully fetched JSON but found no Reddit image,
      // avoid falling back to random DOM images.
      if (result.fetched) {
        return undefined;
      }

      return fallbackDomImage({ htmlDom });
    }) as unknown as RulesOptions,
    title: (async ({ url, htmlDom }: { url: string; htmlDom: CheerioAPI }) => {
      if (!extractRedditPostId(url)) {
        return undefined;
      }
      const result = await fetchRedditPostData(url, htmlDom);
      if (result.post) {
        const redditTitle = extractTitleFromPost(result.post);
        if (redditTitle) {
          return redditTitle;
        }
      }

      return fallbackDomTitle({ htmlDom });
    }) as unknown as RulesOptions,
    author: (async ({ url, htmlDom }: { url: string; htmlDom: CheerioAPI }) => {
      const result = await fetchRedditPostData(url, htmlDom);
      if (result.post) {
        return extractAuthorFromPost(result.post);
      }
      return undefined;
    }) as unknown as RulesOptions,
    datePublished: (async ({
      url,
      htmlDom,
    }: {
      url: string;
      htmlDom: CheerioAPI;
    }) => {
      const result = await fetchRedditPostData(url, htmlDom);
      if (result.post) {
        return extractDateFromPost(result.post);
      }
      return undefined;
    }) as unknown as RulesOptions,
    publisher: (async ({
      url,
      htmlDom,
    }: {
      url: string;
      htmlDom: CheerioAPI;
    }) => {
      const result = await fetchRedditPostData(url, htmlDom);
      if (result.post) {
        return extractPublisherFromPost(result.post);
      }
      return undefined;
    }) as unknown as RulesOptions,
    logo: (async ({ url, htmlDom }: { url: string; htmlDom: CheerioAPI }) => {
      const result = await fetchRedditPostData(url, htmlDom);
      if (result.post) {
        return REDDIT_LOGO_URL;
      }
      return undefined;
    }) as unknown as RulesOptions,
    readableContentHtml: (async ({
      url,
      htmlDom,
    }: {
      url: string;
      htmlDom: CheerioAPI;
    }) => {
      if (!extractRedditPostId(url)) {
        return undefined;
      }
      const result = await fetchRedditPostData(url, htmlDom);
      if (result.post) {
        const body = result.bodyHtml ?? "";
        const commentsHtml = buildCommentsHtml(result.comments);
        // Combine the post body (often empty on link/discussion posts) with the
        // top comments so the reader view and tagger have real content. Fall
        // back to the title if the post has neither body nor comments.
        const content = [body, commentsHtml].filter(Boolean).join("");
        return (content || titleToHtml(result.post.title)) ?? null;
      }
      // Guard: the JSON fetch failed (e.g. Reddit rate-limited us). Returning
      // undefined here would let the generic readability pass scrape the
      // rendered page, which on Reddit captures the cookie-consent banner as
      // the article body and poisons tagging/summaries. Fall back to the post
      // title from the DOM so we store something meaningful; a later re-crawl
      // can still recover the full body once the JSON fetch succeeds.
      const domTitle = fallbackDomTitle({ htmlDom });
      return domTitle ? titleToHtml(domTitle) : undefined;
    }) as unknown as RulesOptions,
  };

  return rules;
};

export default metascraperReddit;
