export function truncateUrl(url: string): string {
  return url.length > 100 ? url.slice(0, 100) + "..." : url;
}

/**
 * Redact sensitive query parameters (e.g., tokens) from a URL for safe logging.
 */
export function redactUrlCredentials(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      parsed.searchParams.set(key, "REDACTED");
    }
    if (parsed.username) {
      parsed.username = "REDACTED";
    }
    if (parsed.password) {
      parsed.password = "REDACTED";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Normalize a Content-Type header by stripping parameters (e.g., charset)
 * and lowercasing the media type, so comparisons against supported types work.
 */
export function normalizeContentType(header: string | null): string | null {
  if (!header) {
    return null;
  }
  return header.split(";", 1)[0]!.trim().toLowerCase();
}

export function shouldRetryCrawlStatusCode(statusCode: number | null): boolean {
  if (statusCode === null) {
    return false;
  }
  return statusCode === 403 || statusCode === 429 || statusCode >= 500;
}

/**
 * Turns the browser's own user agent into the one a regular (non-headless)
 * Chrome of the same version and platform would send: drops the "Headless"
 * marker and applies Chrome's user-agent reduction (minor version zeroed).
 */
export function normalizeBrowserUserAgent(userAgent: string): string {
  return userAgent
    .replace("HeadlessChrome/", "Chrome/")
    .replace(/Chrome\/(\d+)\.[\d.]+/, "Chrome/$1.0.0.0");
}

/**
 * Gives a best-effort download (e.g. the banner image) its own time budget on
 * top of the job-wide signal, so a host that never answers only costs that
 * download instead of the whole crawl. A non-positive budget disables the
 * separate timeout (AbortSignal.timeout rejects negative values, and 0 would
 * skip every download), leaving only the job-wide signal.
 */
export function withDownloadTimeout(
  jobSignal: AbortSignal,
  timeoutSec: number,
): AbortSignal {
  if (!(timeoutSec > 0) || !Number.isFinite(timeoutSec)) {
    return jobSignal;
  }
  // AbortSignal.timeout only takes whole milliseconds, and its timer falls
  // back to 1 ms for anything above the signed 32-bit range (~24.8 days).
  const timeoutMs = Math.min(
    Math.max(1, Math.round(timeoutSec * 1000)),
    0x7fffffff,
  );
  return AbortSignal.any([jobSignal, AbortSignal.timeout(timeoutMs)]);
}
