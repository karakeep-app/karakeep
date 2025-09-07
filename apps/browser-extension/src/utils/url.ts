/**
 * Check if a URL is an HTTP or HTTPS URL.
 * @param url The URL to check.
 * @returns True if the URL starts with "http://" or "https://", false otherwise.
 */
export function isHttpUrl(url: string) {
  const lower = url.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://");
}

/**
 * Normalize a URL by removing the hash and trailing slash.
 * @param url The URL to process.
 * @param base Optional base URL for relative URLs.
 * @returns Normalized URL as string.
 */
export function normalizeUrl(url: string, base?: string): string {
  const u = new URL(url, base);
  u.hash = ""; // Remove hash fragment
  let pathname = u.pathname;
  if (pathname.endsWith("/") && pathname !== "/") {
    pathname = pathname.slice(0, -1); // Remove trailing slash except for root "/"
  }
  u.pathname = pathname;
  return u.toString();
}

/**
 * Compare two URLs ignoring hash and trailing slash.
 * @param url1 First URL.
 * @param url2 Second URL.
 * @param base Optional base URL for relative URLs.
 * @returns True if URLs match after normalization.
 */
export function urlsMatchIgnoringAnchorAndTrailingSlash(
  url1: string,
  url2: string,
  base?: string,
): boolean {
  return normalizeUrl(url1, base) === normalizeUrl(url2, base);
}
