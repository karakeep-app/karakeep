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
 * Normalize the server address by stripping common API path suffixes.
 * Users often mistakenly include /api/v1 or /api in their server address,
 * but the tRPC client already appends /api/trpc to the base address.
 * Also validates that the address is a valid HTTP or HTTPS URL.
 * @param address The server address to normalize.
 * @returns Normalized server address without API path suffixes.
 * @throws Error if the address is not a valid HTTP or HTTPS URL.
 */
export function normalizeServerAddress(address: string): string {
  let normalized = address.trim();

  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, "");

  // Strip common API path suffixes that users might mistakenly include
  // The tRPC client appends /api/trpc, so we need the base URL
  const apiSuffixPatterns = [
    /\/api\/v\d+$/i, // /api/v1, /api/v2, etc.
    /\/api$/i, // /api
  ];

  for (const pattern of apiSuffixPatterns) {
    normalized = normalized.replace(pattern, "");
  }

  // Validate URL scheme (case-insensitive, consistent with isHttpUrl)
  const lowerNormalized = normalized.toLowerCase();
  if (
    !lowerNormalized.startsWith("http://") &&
    !lowerNormalized.startsWith("https://")
  ) {
    throw new Error("Server address must be a valid HTTP or HTTPS URL");
  }

  // Validate URL format
  try {
    new URL(normalized);
  } catch {
    throw new Error("Invalid URL format");
  }

  return normalized;
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
