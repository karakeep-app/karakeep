import { randomUUID } from "node:crypto";

// SingleFile embeds fonts and images as base64. Building several DOMs from
// those strings amplifies memory use even though extraction needs only markup.
const BASE64_DATA_URI =
  /data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*;base64,[a-z0-9+/=]+/gi;
const MIN_COMPACT_LENGTH = 4096;

export function compactEmbeddedDataUris(htmlContent: string): {
  htmlContent: string;
  restore: (value: string) => string;
} {
  const nonce = randomUUID().replaceAll("-", "");
  const originals = new Map<string, string>();
  const placeholders = new Map<string, string>();
  const compacted = htmlContent.replace(BASE64_DATA_URI, (uri) => {
    if (uri.length < MIN_COMPACT_LENGTH) return uri;
    const existing = placeholders.get(uri);
    if (existing) return existing;
    const prefix = uri.slice(0, uri.indexOf(",") + 1);
    // Preserve the MIME type and enough length that Readability and our lazy
    // image normalizer do not mistake this for a tiny placeholder image.
    const payload = `${nonce}${originals.size.toString(16)}`.padEnd(256, "A");
    const placeholder = prefix + payload;
    originals.set(placeholder, uri);
    placeholders.set(uri, placeholder);
    return placeholder;
  });
  return {
    htmlContent: compacted,
    // One pass avoids repeatedly scanning output that has already expanded
    // back to multi-megabyte image data.
    restore: (value) =>
      value.replace(BASE64_DATA_URI, (uri) => originals.get(uri) ?? uri),
  };
}
