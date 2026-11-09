// Placeholder origin used to resolve relative paths; any path that resolves to
// a different origin would leave the site.
const SAME_ORIGIN_BASE = "http://redirect-check.invalid";

/**
 * Validates a redirect URL to prevent open redirect attacks.
 * Only allows:
 * - Relative paths that stay on the current origin (returned normalized)
 * - The karakeep:// scheme for the mobile app
 *
 * @returns The validated URL if valid, otherwise undefined.
 */
export function validateRedirectUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) {
    return undefined;
  }

  // Allow same-origin relative paths. A plain "doesn't start with //" check
  // isn't enough: browsers treat "\" as "/" and drop tabs and newlines, so
  // "/\evil.com" or "/\t/evil.com" are protocol-relative URLs too. Resolve the
  // path the way a browser would, and return the normalized result so that
  // what we validated is exactly what gets redirected to.
  if (url.startsWith("/")) {
    let resolved: URL;
    try {
      resolved = new URL(url, SAME_ORIGIN_BASE);
    } catch {
      return undefined;
    }
    if (resolved.origin !== SAME_ORIGIN_BASE) {
      return undefined;
    }
    // Dot-segment removal can turn "/a/..//evil.com" (or "//<base>//evil.com")
    // into the path "//evil.com", which is protocol-relative once returned
    // without its origin. After parsing, the path has no "\" or whitespace
    // left, so a leading "//" is the only remaining way to leave the site.
    if (resolved.pathname.startsWith("//")) {
      return undefined;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  }

  // Allow karakeep:// scheme for mobile app deep links
  if (url.startsWith("karakeep://")) {
    return url;
  }

  // Reject all other schemes (http, https, javascript, data, etc.)
  return undefined;
}

/**
 * Checks if the redirect URL is a mobile app deep link.
 */
export function isMobileAppRedirect(url: string): boolean {
  return url.startsWith("karakeep://");
}
