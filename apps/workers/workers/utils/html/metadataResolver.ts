import { decode as decodeHtmlEntities } from "html-entities";

import type { ParseSubprocessOutput } from "./parseHtmlSubprocessIpc";

/**
 * Challenge or consent interstitial titles that require human interaction and
 * never clear on their own by waiting in the browser or retrying.
 */
const NON_WAITABLE_CHALLENGE_TITLES = new Set([
  // Reddit
  "reddit - prove your humanity",
  // Facebook login wall
  "log in or sign up to view",
  "log into facebook",
  // Google / YouTube EU/UK consent wall
  "before you continue to youtube",
  "before you continue to google",
  // Zhihu security verification
  "安全验证 - 知乎",
  "安全验证",
]);

/**
 * Body markers for human-solved verification interstitials (e.g. WeChat
 * environment verification) that will not clear by waiting or retrying.
 */
const NON_WAITABLE_BODY_MARKERS = [
  "当前环境异常，完成验证后即可继续访问",
  "wappoc_appmsgcaptcha",
];

/**
 * Exact (lowercased, trimmed) page titles used by common bot-protection
 * interstitials and block pages. Matched exactly, not as substrings, so a
 * legitimate article about bot walls doesn't trip the heuristic.
 */
const CHALLENGE_PAGE_TITLES = new Set([
  // Cloudflare
  "just a moment...",
  "attention required! | cloudflare",
  "one moment, please...",
  // Akamai / generic block pages
  "access denied",
  // PerimeterX
  "access to this page has been denied",
  "access to this page has been denied.",
  "robot or human?",
  // Amazon / Bloomberg
  "robot check",
  "are you a robot?",
  // Distil Networks / Imperva
  "pardon our interruption",
  // Generic captcha interstitials
  "human verification",
  "verify you are human",
  "verifying you are human",
  "bot verification",
  // Vercel
  "vercel security checkpoint",
  ...NON_WAITABLE_CHALLENGE_TITLES,
]);

/**
 * High-confidence markers that only appear in the markup of an actual
 * challenge/block page (captcha iframes, challenge bootstrap globals,
 * interstitial copy) — not in the vendor's loader snippets that protected
 * sites embed on every page.
 */
const CHALLENGE_PAGE_BODY_MARKERS = [
  // Cloudflare interstitial
  "cf_chl_opt",
  "cf-browser-verification",
  "cf-challenge-running",
  "checking your browser before accessing",
  "enable javascript and cookies to continue",
  "verifying you are human",
  // PerimeterX captcha block page
  "px-captcha",
  // DataDome captcha host (only referenced from its block page)
  "captcha-delivery.com",
  // Akamai / Apache-style forbidden pages
  "you don't have permission to access",
  ...NON_WAITABLE_BODY_MARKERS,
];

/**
 * Challenge and block pages are tiny; real articles are not. Body markers are
 * only searched in small documents so an article merely *quoting* interstitial
 * copy (e.g. a post about bot protection) isn't misclassified.
 */
const CHALLENGE_PAGE_MAX_HTML_LENGTH = 100_000;

/**
 * The text of the document's <title>, for when the page isn't parsed. A regex
 * is enough here: it's only used to match the short, plain titles of
 * challenge pages.
 */
export function extractHtmlTitle(htmlContent: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(htmlContent);
  if (!match) {
    return null;
  }
  return decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim();
}

/**
 * Conservative detection of bot-challenge/block pages that are served with an
 * HTTP 200 and would otherwise look like a successful crawl. Prefers false
 * negatives over false positives: exact title matches, plus high-confidence
 * body markers gated on the document being challenge-page sized.
 */
export function isLikelyChallengePage({
  title,
  htmlContent,
}: {
  title?: string | null;
  htmlContent?: string | null;
}): boolean {
  if (title && CHALLENGE_PAGE_TITLES.has(title.trim().toLowerCase())) {
    return true;
  }
  if (!htmlContent || htmlContent.length > CHALLENGE_PAGE_MAX_HTML_LENGTH) {
    return false;
  }
  const lowered = htmlContent.toLowerCase();
  return CHALLENGE_PAGE_BODY_MARKERS.some((marker) => lowered.includes(marker));
}

// DataDome's captcha page (as opposed to its self-clearing device check) needs
// a human to solve it, so there's no point waiting for it to clear.
const DATADOME_HARD_CAPTCHA = /['"]rt['"]\s*:\s*['"]c['"]/;

/**
 * Whether the page matches a deterministic human-only interstitial (consent
 * wall, login wall, or interactive verification) that will not clear on its
 * own by waiting or retrying.
 */
export function isHumanOnlyInterstitial(
  title?: string | null,
  htmlContent?: string | null,
): boolean {
  if (title && NON_WAITABLE_CHALLENGE_TITLES.has(title.trim().toLowerCase())) {
    return true;
  }
  if (!htmlContent || htmlContent.length > CHALLENGE_PAGE_MAX_HTML_LENGTH) {
    return false;
  }
  const lowered = htmlContent.toLowerCase();
  return NON_WAITABLE_BODY_MARKERS.some((marker) => lowered.includes(marker));
}

/**
 * Whether the page is a bot challenge that may clear by itself (and reload
 * into the real page) if the browser keeps waiting.
 */
export function isWaitableChallenge(
  title: string,
  htmlContent: string,
): boolean {
  if (isHumanOnlyInterstitial(title, htmlContent)) {
    return false;
  }
  return (
    isLikelyChallengePage({ title, htmlContent }) &&
    !DATADOME_HARD_CAPTCHA.test(htmlContent)
  );
}

function normalizeHostForRedirectCheck(hostname: string): string {
  return hostname.toLowerCase().replace(/^(?:www|m)\./, "");
}

/**
 * Whether a deep bookmark URL was redirected by the browser to the bare root
 * homepage of the same site (for example, an unauthenticated share link that
 * bounced to `/`). In that case the preflight probe often still holds the
 * specific page's metadata while the render only reflects the generic homepage.
 */
export function isDeepPathRedirectedToRoot(
  requestedUrl: string,
  finalUrl: string,
): boolean {
  if (!requestedUrl || !finalUrl || requestedUrl === finalUrl) {
    return false;
  }
  try {
    const requested = new URL(requestedUrl);
    const final = new URL(finalUrl);
    if (
      normalizeHostForRedirectCheck(requested.hostname) !==
      normalizeHostForRedirectCheck(final.hostname)
    ) {
      return false;
    }
    const requestedIsDeep =
      requested.pathname !== "/" && requested.pathname !== "";
    const finalIsBareRoot =
      (final.pathname === "/" || final.pathname === "") &&
      !final.search &&
      !final.hash;
    return requestedIsDeep && finalIsBareRoot;
  } catch {
    return false;
  }
}

/**
 * Merges the browser render's metadata with the preflight probe's, per field.
 * The render normally wins (it sees the post-JS DOM), with the probe filling
 * gaps. But when the render was blocked (retryable status code on the last
 * retry attempt, or a challenge page served with a 200), its metadata is
 * likely from a challenge or error page, so the probe's values take
 * precedence instead and the render only fills gaps.
 */
export function resolveMetadata(
  renderMeta: ParseSubprocessOutput["metadata"],
  probeMeta: ParseSubprocessOutput["metadata"] | null,
  renderBlocked: boolean,
): ParseSubprocessOutput["metadata"] {
  if (!probeMeta) {
    return renderMeta;
  }
  const pick = (
    render: string | null | undefined,
    probe: string | null | undefined,
  ): string | null =>
    (renderBlocked ? probe || render : render || probe) || null;
  return {
    ...renderMeta,
    title: pick(renderMeta.title, probeMeta.title),
    description: pick(renderMeta.description, probeMeta.description),
    image: pick(renderMeta.image, probeMeta.image),
    logo: pick(renderMeta.logo, probeMeta.logo),
    author: pick(renderMeta.author, probeMeta.author),
    publisher: pick(renderMeta.publisher, probeMeta.publisher),
    datePublished: pick(renderMeta.datePublished, probeMeta.datePublished),
    dateModified: pick(renderMeta.dateModified, probeMeta.dateModified),
  };
}
