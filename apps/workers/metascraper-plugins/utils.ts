/**
 * Extract the domain name without suffix from a URL.
 * e.g. "https://x.com/foo" -> "x", "https://reddit.com" -> "reddit"
 */
export const domainFromUrl = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return hostname;
  } catch {
    return "";
  }
};
