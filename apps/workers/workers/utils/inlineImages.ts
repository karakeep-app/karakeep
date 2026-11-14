import { randomBytes } from "node:crypto";

/**
 * Base64 image data URIs, as SingleFile writes them for every image of a page.
 * Only the base64 form is handled: its alphabet needs no escaping in HTML
 * attributes or JSON, so placeholders can be swapped back on the parser's
 * serialized output without re-encoding anything.
 */
const BASE64_IMAGE_DATA_URI_PATTERN =
  /data:(image\/[a-z0-9.+-]+);base64,[a-z0-9+/]+=*/gi;

/**
 * Inline images smaller than this stay in the document. Tiny ones (lazy-load
 * placeholders, icons) cost nothing to parse, and the lazy-load handling looks
 * at their actual data URI.
 */
export const DEFAULT_MIN_STASHED_IMAGE_LENGTH = 16 * 1024;

/**
 * Placeholders are padded past the parser's 200-character cutoff for lazy-load
 * placeholder images, so they're never mistaken for one.
 */
const PLACEHOLDER_LENGTH = 256;

/**
 * Tells whether a data URI is an embedded resource (an attribute value inside
 * a tag, or a CSS `url()` inside a `<style>` element) rather than text the
 * reader sees, such as a data URI or CSS shown in a code sample. Visible text
 * is left alone so that content extraction and the reader-view assessment see
 * the page exactly as it is.
 *
 * Base64 never contains `<` or `>`, so the last one before the URI tells
 * whether it sits inside a tag. A `>` inside an earlier attribute value only
 * makes this miss an image, which then stays in the document as before.
 * Offsets must be asked in increasing order: the scan only moves forward, so
 * every character is read once however many images a tag or style block has.
 */
function embeddedResourceChecker(htmlContent: string) {
  let scanned = 0;
  let insideTag = false;
  let insideStyle = false;
  return (offset: number): boolean => {
    for (; scanned < offset; scanned++) {
      const char = htmlContent.charCodeAt(scanned);
      if (char === 60 /* < */) {
        insideTag = true;
        const tag = htmlContent.slice(scanned + 1, scanned + 8).toLowerCase();
        if (/^style[\s>/]/.test(tag)) {
          insideStyle = true;
        } else if (/^\/style[\s>]/.test(tag)) {
          insideStyle = false;
        }
      } else if (char === 62 /* > */) {
        insideTag = false;
      }
    }
    if (insideTag) {
      return true;
    }
    return (
      insideStyle &&
      /url\(\s*["']?$/i.test(
        htmlContent.slice(Math.max(0, offset - 16), offset),
      )
    );
  };
}

export interface StashedInlineImages {
  /** The document with each large inline image replaced by a short one. */
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
 * Swap each large inline image for a short data URI of the same image type
 * before parsing, and restore the original in the parser's output afterwards,
 * so the reader view keeps its images and the stored archive is never touched.
 * Because the placeholder is still a `data:image/...` URI, DOMPurify applies
 * exactly the policy it would apply to the original: where it drops a data URI
 * (an `<a href>`, say), the placeholder is dropped too and nothing is restored.
 */
export function stashInlineImages(
  htmlContent: string,
  minLength = DEFAULT_MIN_STASHED_IMAGE_LENGTH,
): StashedInlineImages {
  // A per-run token keeps a page's own content from ever matching a placeholder.
  const marker = `KarakeepStash${randomBytes(8).toString("hex")}`;
  const stashed: string[] = [];
  let bytes = 0;
  const isEmbeddedResource = embeddedResourceChecker(htmlContent);

  const replaced = htmlContent.replace(
    BASE64_IMAGE_DATA_URI_PATTERN,
    (dataUri, mimeType: string, offset: number) => {
      if (dataUri.length < minLength || !isEmbeddedResource(offset)) {
        return dataUri;
      }
      bytes += dataUri.length;
      stashed.push(dataUri);
      const placeholder = `data:${mimeType};base64,${marker}i${stashed.length - 1}e`;
      return placeholder.padEnd(PLACEHOLDER_LENGTH, "A");
    },
  );

  const placeholderPattern = new RegExp(
    `data:image/[a-z0-9.+-]+;base64,${marker}i(\\d+)eA*`,
    "gi",
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
