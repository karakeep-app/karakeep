/**
 * Compact relative-time / domain / reading-time helpers for the dense
 * "1a" file list. These are intentionally small and dependency-free —
 * the design calls for very short mono-styled labels (`2d`, `1w`, ...)
 * rather than date-fns's verbose "2 days ago" output.
 */

export function formatCompactRelativeTime(date: Date): string {
  const now = Date.now();
  const diffSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));

  if (diffSeconds < 60) return "now";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (days < 31) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

export function getDomainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const WORDS_PER_MINUTE = 200;

/**
 * The bookmark list query doesn't include full page content (that would be
 * far too expensive to load per-row), so there's no exact word count to
 * derive a reading time from here. As a stand-in, estimate off of the
 * AI summary length, which is a reasonable proxy for how substantial the
 * underlying article is.
 */
export function estimateReadingTimeMinutes(summary: string | null | undefined) {
  if (!summary) return null;
  const words = summary.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return null;
  // The summary itself is much shorter than the source article, so scale
  // it up loosely rather than reporting a literal (and misleadingly tiny)
  // reading time for the summary text.
  const minutes = Math.max(1, Math.round((words / WORDS_PER_MINUTE) * 6));
  return minutes;
}
