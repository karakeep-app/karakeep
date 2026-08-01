import type { ParseSubprocessOutput } from "./parseHtmlSubprocessIpc";

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
];

/**
 * Challenge and block pages are tiny; real articles are not. Body markers are
 * only searched in small documents so an article merely *quoting* interstitial
 * copy (e.g. a post about bot protection) isn't misclassified.
 */
const CHALLENGE_PAGE_MAX_HTML_LENGTH = 100_000;

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
