const EMBEDDED_MEDIA_DATA_URI_PATTERN = /data:(?:audio|video)\/[^"'\s<>)]*/gi;

const PRESERVED_SCRIPT_TYPE_PATTERN =
  /(?:^|\s)type\s*=\s*(?:"(?:application\/(?:ld\+)?json|math\/[^"]*)"|'(?:application\/(?:ld\+)?json|math\/[^']*)'|(?:application\/(?:ld\+)?json|math\/\S*))/i;

const PRESERVED_SCRIPT_ID_PATTERN =
  /(?:^|\s)id\s*=\s*(?:"(?:initial-state|preloads-json)"|'(?:initial-state|preloads-json)'|(?:initial-state|preloads-json)(?=\s|$))/i;

const SCRIPT_SRC_ATTR_PATTERN = /(?:^|\s)src\s*=/i;

const PRESERVED_INLINE_SCRIPT_MARKERS = [
  "$RC(",
  "ytInitial",
  "__preloadedData",
  "_preloads",
];

// Raw-text elements whose contents are NOT parsed as HTML tags by the HTML
// tokenizer (so `<style>` or `<script>` text inside them must never be stripped).
const RAW_TEXT_SKIP_TAGS = new Set([
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
]);

const MIN_TRACKED_TAG_LENGTH = 3; // "xmp"
const MAX_TRACKED_TAG_LENGTH = 8; // "textarea", "noframes"

function isAsciiAlpha(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90) // A-Z
  );
}

function isTagNameChar(code: number): boolean {
  return (
    isAsciiAlpha(code) ||
    (code >= 48 && code <= 57) || // 0-9
    code === 45 // -
  );
}

function isTagBoundaryChar(code: number): boolean {
  return (
    code === 62 || // >
    code === 47 || // /
    code === 32 || // space
    code === 9 || // \t
    code === 10 || // \n
    code === 12 || // \f
    code === 13 // \r
  );
}

/**
 * Finds the closing `>` of an HTML start tag starting after the tag name,
 * respecting single- and double-quoted attribute values so `>` inside an
 * attribute doesn't prematurely end the tag. Returns -1 if unclosed.
 */
function findStartTagEnd(html: string, start: number): number {
  const len = html.length;
  for (let i = start; i < len; i++) {
    const code = html.charCodeAt(i);
    if (code === 34 || code === 39) {
      // " or ' — skip quoted attribute values with native indexOf so large
      // data-URI attributes don't scan character by character.
      const closeQuote = html.indexOf(code === 34 ? '"' : "'", i + 1);
      if (closeQuote === -1) {
        return -1;
      }
      i = closeQuote;
    } else if (code === 62) {
      // >
      return i;
    }
  }
  return -1;
}

/**
 * Finds the start and end (exclusive) indices of a matching closing tag
 * `</tagName...>` directly in `html` without allocating a lowercased copy.
 * `tagName` must consist strictly of lowercase ASCII letters (`a-z`), so
 * `(code | 32) === tagName.charCodeAt(j)` matches only that ASCII letter
 * case-insensitively. Strictly linear across the document.
 */
function findCloseTag(
  html: string,
  tagName: string,
  contentStart: number,
): { start: number; end: number } | null {
  const nameLen = tagName.length;
  const len = html.length;
  let searchFrom = contentStart;
  while (searchFrom < len) {
    const idx = html.indexOf("</", searchFrom);
    if (idx === -1) {
      return null;
    }
    const afterName = idx + 2 + nameLen;
    if (afterName < len && isTagBoundaryChar(html.charCodeAt(afterName))) {
      let matched = true;
      for (let j = 0; j < nameLen; j++) {
        if ((html.charCodeAt(idx + 2 + j) | 32) !== tagName.charCodeAt(j)) {
          matched = false;
          break;
        }
      }
      if (matched) {
        const gt = html.indexOf(">", afterName);
        return gt === -1 ? null : { start: idx, end: gt + 1 };
      }
    }
    searchFrom = idx + 2;
  }
  return null;
}

function shouldKeepScript(attrs: string, body: string): boolean {
  if (
    PRESERVED_SCRIPT_TYPE_PATTERN.test(attrs) ||
    PRESERVED_SCRIPT_ID_PATTERN.test(attrs)
  ) {
    return true;
  }
  if (SCRIPT_SRC_ATTR_PATTERN.test(attrs)) {
    return false;
  }
  return PRESERVED_INLINE_SCRIPT_MARKERS.some((marker) =>
    body.includes(marker),
  );
}

/**
 * Linear-time, HTML-tokenizer-aware stripper for `<style>` and non-data
 * `<script>` elements.
 *
 * Unlike regexes, this respects HTML comments, quoted attribute values, and
 * raw-text elements (`<script>`, `<style>`, `<textarea>`, `<title>`, etc.), so:
 * - Literal `<style>...</style>` or `"<style>...<\/style>"` inside a `<script>`
 *   string is never misread as a real `<style>` element.
 * - Unclosed opening tags stop stripping immediately instead of backtracking
 *   quadratically.
 */
export function stripHtmlElements(
  html: string,
  opts: { stripStyles: boolean; stripNonDataScripts: boolean },
): string {
  if (!opts.stripStyles && !opts.stripNonDataScripts) {
    return html;
  }
  const len = html.length;
  if (len === 0) {
    return html;
  }

  const out: string[] = [];
  let copyFrom = 0;
  let pos = 0;

  while (pos < len) {
    const lt = html.indexOf("<", pos);
    if (lt === -1) {
      break;
    }

    // HTML comment: skip verbatim to `-->`
    if (
      lt + 3 < len &&
      html.charCodeAt(lt + 1) === 33 && // !
      html.charCodeAt(lt + 2) === 45 && // -
      html.charCodeAt(lt + 3) === 45 // -
    ) {
      const commentEnd = html.indexOf("-->", lt + 4);
      if (commentEnd === -1) {
        // Unclosed comment: keep the remainder untouched.
        break;
      }
      pos = commentEnd + 3;
      continue;
    }

    // HTML tag names must begin with an ASCII letter (e.g. `<3` is plain text).
    if (lt + 1 >= len || !isAsciiAlpha(html.charCodeAt(lt + 1))) {
      pos = lt + 1;
      continue;
    }

    // Read ASCII tag name starting at lt + 1
    let nameEnd = lt + 2;
    while (nameEnd < len && isTagNameChar(html.charCodeAt(nameEnd))) {
      nameEnd++;
    }
    if (nameEnd < len && !isTagBoundaryChar(html.charCodeAt(nameEnd))) {
      pos = nameEnd;
      continue;
    }

    const startTagEnd = findStartTagEnd(html, nameEnd);
    if (startTagEnd === -1) {
      // Unclosed start tag: stop stripping to avoid guessing.
      break;
    }

    const nameLen = nameEnd - (lt + 1);
    if (nameLen < MIN_TRACKED_TAG_LENGTH || nameLen > MAX_TRACKED_TAG_LENGTH) {
      pos = startTagEnd + 1;
      continue;
    }

    // Safe to call `.toLowerCase()` here: `isTagNameChar` guarantees pure ASCII.
    const tagName = html.slice(lt + 1, nameEnd).toLowerCase();
    const isStyle = tagName === "style";
    const isScript = tagName === "script";
    if (!isStyle && !isScript && !RAW_TEXT_SKIP_TAGS.has(tagName)) {
      // Skip the entire opening tag (including quoted attributes that may
      // contain literal `<style>` / `<script>` examples).
      pos = startTagEnd + 1;
      continue;
    }
    const contentStart = startTagEnd + 1;
    const closeTag = findCloseTag(html, tagName, contentStart);
    if (!closeTag) {
      // Unclosed raw-text element: stop stripping so we stay O(n) and never
      // delete trailing content.
      break;
    }

    let shouldStrip = false;
    if (isStyle && opts.stripStyles) {
      shouldStrip = true;
    } else if (isScript && opts.stripNonDataScripts) {
      const attrs = html.slice(nameEnd, startTagEnd);
      const body = html.slice(contentStart, closeTag.start);
      shouldStrip = !shouldKeepScript(attrs, body);
    }

    if (shouldStrip) {
      if (lt > copyFrom) {
        out.push(html.slice(copyFrom, lt));
      }
      copyFrom = closeTag.end;
    }
    pos = closeTag.end;
  }

  if (copyFrom === 0) {
    return html;
  }
  if (copyFrom < len) {
    out.push(html.slice(copyFrom));
  }
  return out.join("");
}

/**
 * Prepares an in-memory copy of HTML for metadata extraction:
 * - Replaces embedded `data:audio/` and `data:video/` URIs (from full-page
 *   archives) to avoid DOM memory amplification.
 * - Strips `<style>` blocks (including the adblocker's cosmetic filter sheet),
 *   which are unused by metadata and content extraction.
 *
 * The original HTML file on disk remains untouched for full-page archival.
 */
export function preprocessHtmlForMetadata(htmlContent: string): {
  htmlContent: string;
  replacedBytes: number;
  replacementCount: number;
} {
  let replacedBytes = 0;
  let replacementCount = 0;
  const withoutMedia = htmlContent.replace(
    EMBEDDED_MEDIA_DATA_URI_PATTERN,
    (dataUri) => {
      replacedBytes += dataUri.length;
      replacementCount += 1;
      return "about:blank";
    },
  );

  return {
    htmlContent: stripHtmlElements(withoutMedia, {
      stripStyles: true,
      stripNonDataScripts: false,
    }),
    replacedBytes,
    replacementCount,
  };
}

/**
 * Strips `<style>` blocks and non-data `<script>` blocks before constructing a
 * JSDOM tree.
 *
 * Neither Defuddle (in Node.js, where `CSSMediaRule` is undefined and computed
 * styles are skipped), Readability, nor `assessReaderView` execute scripts or
 * read stylesheets. Keeping JSON-LD, JSON data scripts (e.g. Threads replies),
 * math scripts, and known site-extractor inline data (`$RC(`, `ytInitial*`,
 * `__preloadedData`, `_preloads`, `#initial-state`, `#preloads-json`) cuts
 * JSDOM parsing time roughly in half while preserving all extractor inputs.
 */
export function stripNonContentMarkupForDom(htmlContent: string): string {
  return stripHtmlElements(htmlContent, {
    stripStyles: true,
    stripNonDataScripts: true,
  });
}
