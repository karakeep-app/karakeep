/**
 * Validates a redirect URL to prevent open redirect attacks.
 * Only allows:
 * - Relative paths starting with "/" (but not "//" to prevent protocol-relative URLs)
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

  // Allow relative paths starting with "/" but not "//" (protocol-relative URLs)
  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
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
