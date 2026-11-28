import type { Rules } from "metascraper";

const AMAZON_HOST_PATTERN = /(?:^|\.)(?:amazon|amzn)\.|(?:^|\.)a\.co$/i;
const YOUTUBE_HOST_PATTERN =
  /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
const REDDIT_HOST_PATTERN = /(?:^|\.)reddit\.[^.]+$/i;
const X_HOST_PATTERN = /(?:^|\.)(?:twitter\.com|x\.com)$/i;
const FACEBOOK_HOST_PATTERN = /(?:^|\.)(?:facebook\.com|fb\.com)$/i;
const THREADS_HOST_PATTERN = /(?:^|\.)(?:threads\.net|threads\.com)$/i;

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function isAmazonHost(url: string): boolean {
  return AMAZON_HOST_PATTERN.test(getHostname(url));
}

export function isYoutubeHost(url: string): boolean {
  return YOUTUBE_HOST_PATTERN.test(getHostname(url));
}

export function isRedditHost(url: string): boolean {
  return REDDIT_HOST_PATTERN.test(getHostname(url));
}

export function isXHost(url: string): boolean {
  return X_HOST_PATTERN.test(getHostname(url));
}

export function isFacebookHost(url: string): boolean {
  return FACEBOOK_HOST_PATTERN.test(getHostname(url));
}

export function isThreadsHost(url: string): boolean {
  return THREADS_HOST_PATTERN.test(getHostname(url));
}

// Leading/trailing whitespace and invisible Unicode bidi / zero-width
// formatting characters (e.g. U+200E LEFT-TO-RIGHT MARK emitted in titles or
// as lone placeholder meta descriptions).
const INVISIBLE_FORMAT_CHARS_PATTERN =
  /^[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+|[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+$/g;

// Purely numeric author values (e.g. Facebook page/profile IDs in
// `article:author`) and hidden UI labels matched by `[class*="author"]` (e.g.
// Google Docs' `docs-revisions-authorwidget-hat` "Changes by") are not human
// author names; rejecting them lets metascraper fall through to DOM rules.
const NUMERIC_ONLY_PATTERN = /^\d+$/;
const NON_AUTHOR_UI_LABEL_PATTERN = /^changes\s+by$/i;
const NON_PUBLISHER_INTERSTITIAL_PATTERN =
  /^(?:prove your humanity|just a moment\.{0,3}|attention required!?|access denied|robot check|are you a robot\??|robot or human\??|security check|human verification|log in or sign up to view)$/i;

// Obvious non-banner placeholder / tracking-pixel / favicon image URLs that
// metascraper-image's generic `img[src]` fallback can pick up on SPAs.
const PLACEHOLDER_OR_ICON_IMAGE_PATTERN =
  /(?:(?:^|[/._-])1x1\.(?:gif|png|jpe?g|webp)|\/(?:spacer|blank|pixel|transparent)\.(?:gif|png)|\.ico)(?:$|[?#])/i;

const TEXT_METADATA_PROPS = new Set([
  "title",
  "description",
  "author",
  "publisher",
]);

export function stripInvisibleFormatChars(value: string): string {
  return value.replace(INVISIBLE_FORMAT_CHARS_PATTERN, "");
}

/**
 * Per-candidate validator passed to metascraper's `validate` option. Returning
 * `false` rejects that rule's result so metascraper continues trying fallback
 * rules instead of returning junk or empty-after-cleaning values.
 */
export function isValidMetadataValue(
  value: unknown,
  { propName }: { propName?: string },
): boolean {
  if (typeof value !== "string") {
    return true;
  }
  const cleaned = stripInvisibleFormatChars(value);
  if (propName && TEXT_METADATA_PROPS.has(propName) && cleaned.length === 0) {
    return false;
  }
  if (
    propName === "author" &&
    (NUMERIC_ONLY_PATTERN.test(cleaned) ||
      NON_AUTHOR_UI_LABEL_PATTERN.test(cleaned))
  ) {
    return false;
  }
  if (
    propName === "publisher" &&
    NON_PUBLISHER_INTERSTITIAL_PATTERN.test(cleaned)
  ) {
    return false;
  }
  if (propName === "image" && PLACEHOLDER_OR_ICON_IMAGE_PATTERN.test(cleaned)) {
    return false;
  }
  return true;
}

export function parseIsoDateValue(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = new Date(raw.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * YouTube embeds comments with `dateCreated` inside VideoObject JSON-LD, which
 * otherwise beats `<meta itemprop="datePublished">` in `metascraper-date`'s
 * rule order. Run this rule before `metascraper-date` on YouTube hosts so the
 * video's own publish/upload date wins.
 */
export function createYoutubeDatePublishedRule(): Rules {
  return {
    datePublished: [
      ({ htmlDom: $ }) =>
        parseIsoDateValue($('[itemprop="datePublished" i]').attr("content")),
      ({ htmlDom: $ }) =>
        parseIsoDateValue($('[itemprop="uploadDate" i]').attr("content")),
    ],
  };
}

function cleanTextField(value: unknown): string | null | undefined {
  if (typeof value !== "string") {
    return value as null | undefined;
  }
  const cleaned = stripInvisibleFormatChars(value);
  return cleaned || null;
}

export function normalizeMetadata<T extends Record<string, unknown>>(
  meta: T,
): T {
  const title = cleanTextField(meta.title);
  const description = cleanTextField(meta.description);
  const author = cleanTextField(meta.author);
  let publisher = cleanTextField(meta.publisher);
  // metascraper-publisher falls back to `[class*="logo"] img[alt]`, which
  // often yields alt text like "Example logo".
  if (publisher && /\s+logo$/i.test(publisher)) {
    publisher = publisher.replace(/\s+logo$/i, "").trim() || publisher;
  }
  return {
    ...meta,
    title,
    description,
    author,
    publisher,
  };
}
