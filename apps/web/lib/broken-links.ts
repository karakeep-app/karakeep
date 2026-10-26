export type BrokenLinkIssue =
  | "blocked"
  | "missing"
  | "server"
  | "http"
  | "failed";

const BLOCKED_STATUS_CODES = new Set([401, 403, 429]);
const MISSING_STATUS_CODES = new Set([404, 410]);

export function getBrokenLinkIssue(statusCode: number | null): BrokenLinkIssue {
  if (statusCode !== null) {
    if (BLOCKED_STATUS_CODES.has(statusCode)) return "blocked";
    if (MISSING_STATUS_CODES.has(statusCode)) return "missing";
    if (statusCode >= 500) return "server";
    if (statusCode < 200 || statusCode >= 300) return "http";
  }
  return "failed";
}

export function getLinkHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function stripUrlProtocol(url: string) {
  return url.replace(/^https?:\/\//, "");
}
