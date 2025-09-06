/**
 * Check if a URL is an HTTP or HTTPS URL.
 * @param url The URL to check.
 * @returns True if the URL starts with "http://" or "https://", false otherwise.
 */
export function isHttpUrl(url: string) {
  const lower = url.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://");
}
