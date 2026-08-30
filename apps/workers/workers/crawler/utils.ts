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
  const head = new TextDecoder("iso-8859-1").decode(body.subarray(0, 8192));
  return head.match(META_CHARSET_RE)?.[2];
}

/**
 * Rewrite the HTML's charset declarations to UTF-8.
 *
 * The crawled HTML is a UTF-8 string (from the DOM serialization or from
 * `decodeHtmlResponse`), but the declaration the original page used to declare
 * its legacy encoding (e.g. `<meta charset="shift_jis">` on oricon.co.jp)
 * survives serialization untouched, and monolith passes the document through
 * without transcoding. Left alone, viewers decode the UTF-8 bytes as the legacy
 * encoding and render mojibake.
 */
export function normalizeHtmlCharset(html: string): string {
  return html.replace(/<meta[^>]*>/gi, (metaTag) =>
    metaTag.replace(/\bcharset\s*=\s*(["']?)[^"'>]*\1/gi, "charset=$1UTF-8$1"),
  );
}
