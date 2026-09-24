export function setUrlHostnameFromResolvedAddress(url: URL, address: string) {
  url.hostname = address.includes(":") ? `[${address}]` : address;
}

const ALLOWED_BOOKMARK_URL_PROTOCOLS: readonly string[] = ["http:", "https:"];

/**
 * Bookmark link URLs are reflected in HTML exports, RSS feeds and anchor tags,
 * so schemes like javascript:, data: and vbscript: must never be accepted.
 */
export function isAllowedBookmarkUrl(url: string): boolean {
  try {
    return ALLOWED_BOOKMARK_URL_PROTOCOLS.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

// Shorteners whose stored URL we replace with the crawler's resolved
// destination. Kept to an allowlist so ordinary redirects don't rewrite URLs.
export const KNOWN_LINK_SHORTENERS: readonly string[] = [
  "search.app",
  "share.google",
];

// Exact-host match (Google emits the bare hosts); subdomains don't count.
export function isKnownLinkShortener(url: string): boolean {
  try {
    return KNOWN_LINK_SHORTENERS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

// Returns the resolved URL to store in place of a shortener, or undefined to
// keep the original. The isAllowedBookmarkUrl guard blocks unsafe schemes.
export function resolveShortenedBookmarkUrl(
  originalUrl: string,
  crawledUrl: string,
): string | undefined {
  if (
    isKnownLinkShortener(originalUrl) &&
    crawledUrl !== originalUrl &&
    isAllowedBookmarkUrl(crawledUrl)
  ) {
    return crawledUrl;
  }
  return undefined;
}
