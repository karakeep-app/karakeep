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

const CONTENT_TYPE_CHARSET_RE = /(?:^|;)\s*charset\s*=\s*"?([^";\s]+)"?/i;
// Matches `<meta ...>` tags declaring a charset, either via the `charset`
// attribute or via `http-equiv="Content-Type"` + `content="...; charset=..."`.
const META_CHARSET_RE = /<meta[^>]*\bcharset\s*=\s*(["']?)([^"'\s;>]+)\1/i;

// Structural type so both the global fetch Response and node-fetch's Response
// (which `fetchWithProxy` can return) are accepted.
interface HtmlResponseLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  headers: { get(name: string): string | null };
}

/**
 * Decode an HTML response body, honoring the character encoding it declares in
 * its Content-Type header (or, when the header doesn't declare one, in its
 * `<meta>` tags). `Response.text()` always decodes as UTF-8, so pages served
 * with a legacy encoding (e.g. Shift_JIS or EUC-JP, like oricon.co.jp) come out
 * as mojibake. Falls back to UTF-8 when no encoding is declared or the declared
 * label isn't supported.
 */
export async function decodeHtmlResponse(
  response: HtmlResponseLike,
): Promise<string> {
  const body = new Uint8Array(await response.arrayBuffer());
  const headerCharset = response.headers
    .get("content-type")
    ?.match(CONTENT_TYPE_CHARSET_RE)?.[1];
  const charset = headerCharset ?? sniffMetaCharset(body);
  try {
    // TextDecoder throws on unknown labels, which we fall back from below.
    return new TextDecoder(charset?.trim() ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function sniffMetaCharset(body: Uint8Array): string | undefined {
  // Decode the start of the body as latin1 so every byte maps to a single
  // character and the ASCII meta tags are readable. Charset declarations
  // always appear in the first 1024 bytes per the HTML sniffing rules.
  const head = new TextDecoder("iso-8859-1").decode(body.subarray(0, 1024));
  return head.match(META_CHARSET_RE)?.[2];
}

const UTF8_META = '<meta charset="UTF-8">';

/**
 * Make the HTML self-describing as UTF-8: rewrite existing charset
 * declarations to UTF-8, and add one when the document has none.
 *
 * The crawled HTML is a UTF-8 string (from the DOM serialization or from
 * `decodeHtmlResponse`), but the declaration the original page used to declare
 * its legacy encoding (e.g. `<meta charset="shift_jis">` on oricon.co.jp)
 * survives serialization untouched, and monolith passes the document through
 * without transcoding. Left alone, viewers decode the UTF-8 bytes as the legacy
 * encoding and render mojibake. Conversely, pages that declare their charset
 * only in the HTTP header (e.g. UTF-8 pages like indiewire.com) end up with no
 * declaration at all, so viewers of the archive fall back to windows-1252; the
 * archive is also often opened as a standalone file, where no header exists at
 * all, hence adding the declaration here (the API additionally serves HTML
 * assets with an explicit `charset=utf-8`).
 */
export function normalizeHtmlCharset(html: string): string {
  const normalized = html.replace(/<meta[^>]*>/gi, (metaTag) =>
    metaTag.replace(
      // Quoted values run up to their closing quote; unquoted values stop at
      // whitespace, `>`, or a quote (the end of the surrounding attribute),
      // so an unquoted value never swallows the following attributes.
      /\bcharset\s*=\s*(?:(["'])[^"']*\1|[^\s"'>]+)/gi,
      (_match, quote: string | undefined) =>
        `charset=${quote ?? ""}UTF-8${quote ?? ""}`,
    ),
  );
  // Browsers only honor meta declarations inside the first 1024 bytes (never
  // fewer characters than that), so a declaration outside that window doesn't
  // count for viewers of the saved file and we insert a fresh one.
  if (META_CHARSET_RE.test(normalized.slice(0, 1024))) {
    return normalized;
  }
  return insertUtf8CharsetMeta(normalized);
}

function insertUtf8CharsetMeta(html: string): string {
  // Insert after the first of <head>, <html> or <!DOCTYPE> — never before the
  // doctype, which would flip the document into quirks mode. A meta between
  // <html> and <head> still ends up in the head per the HTML parsing rules.
  const anchor =
    html.match(/<head[^>]*>/i) ??
    html.match(/<html[^>]*>/i) ??
    html.match(/<!doctype[^>]*>/i);
  if (!anchor) {
    return `${UTF8_META}${html}`;
  }
  const index = anchor.index! + anchor[0].length;
  return `${html.slice(0, index)}${UTF8_META}${html.slice(index)}`;
}
