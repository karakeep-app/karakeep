/**
 * Validates a redirect URL to prevent open redirect attacks.
 * Only allows:
 * - Relative paths starting with "/" (but not "//" to prevent protocol-relative URLs)
 * - The karakeep:// scheme for the mobile app
 *
 * Returns "/" as a safe fallback for invalid URLs.
 */
export function validateRedirectUrl(url: string | null | undefined): string {
  if (!url) {
    return "/";
  }

  // Allow relative paths starting with "/" but not "//" (protocol-relative URLs)
  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }

  // Allow karakeep:// scheme for mobile app deep links
  if (url.startsWith("karakeep://")) {
    return url;
  }

  // Reject all other schemes (http, https, javascript, data, etc.)
  return "/";
}

/**
 * Checks if the redirect URL is a mobile app deep link.
 */
export function isMobileAppRedirect(url: string): boolean {
  return url.startsWith("karakeep://");
}
