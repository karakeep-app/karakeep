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
