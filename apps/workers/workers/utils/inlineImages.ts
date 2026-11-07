import { randomBytes } from "node:crypto";

/**
 * Base64 image data URIs, as SingleFile writes them for every image of a page.
 * Only the base64 form is handled: its alphabet needs no escaping in HTML
 * attributes or JSON, so the placeholder can be swapped back on the parser's
 * serialized output without re-encoding anything.
 */
const BASE64_IMAGE_DATA_URI_PATTERN =
  /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+=*/gi;

/**
 * Inline images smaller than this stay in the document. Tiny ones (lazy-load
 * placeholders, icons) cost nothing to parse, and the lazy-load handling looks
 * at their actual data URI.
 */
export const DEFAULT_MIN_STASHED_IMAGE_LENGTH = 16 * 1024;

export interface StashedInlineImages {
  /** The document with each large inline image replaced by a short URL. */
  htmlContent: string;
  count: number;
  /** Characters taken out of the document. */
  bytes: number;
  /** Puts the original data URIs back wherever a placeholder survived. */
  restore(text: string): string;
}

/**
 * Full-page archives (SingleFile above all) inline every image as a base64 data
 * URI, so an article of under 1 MB can arrive as a 50 MB document. Metadata
 * and readable-content extraction don't need the image bytes, but JSDOM and
 * Readability amplify them many times over and the parser runs out of memory.
 *
 * Swap each large inline image for a short placeholder URL before parsing and
 * restore it in the parser's output afterwards, so the reader view keeps its
 * images and the stored archive is never touched.
 */
export function stashInlineImages(
  htmlContent: string,
  minLength = DEFAULT_MIN_STASHED_IMAGE_LENGTH,
): StashedInlineImages {
  // A per-run token keeps a page's own links from ever matching a placeholder.
  const prefix = `https://inline-image.karakeep.invalid/${randomBytes(8).toString("hex")}/`;
  const stashed: string[] = [];
  let bytes = 0;

  const replaced = htmlContent.replace(
    BASE64_IMAGE_DATA_URI_PATTERN,
    (dataUri) => {
      if (dataUri.length < minLength) {
        return dataUri;
      }
      bytes += dataUri.length;
      stashed.push(dataUri);
      return `${prefix}${stashed.length - 1}`;
    },
  );

  const placeholderPattern = new RegExp(
    `${prefix.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(\\d+)`,
    "g",
  );

  return {
    htmlContent: replaced,
    count: stashed.length,
    bytes,
    restore(text: string) {
      if (stashed.length === 0) {
        return text;
      }
      return text.replace(
        placeholderPattern,
        (placeholder, index: string) => stashed[Number(index)] ?? placeholder,
      );
    },
  };
}
