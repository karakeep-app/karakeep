const EMBEDDED_MEDIA_DATA_URI_PATTERN = /data:(?:audio|video)\/[^"'\s<>)]*/gi;

const PRESERVED_SCRIPT_TYPE_PATTERN =
  /(?:^|\s)type\s*=\s*(?:"\s*(?:application\/(?:ld\+)?json(?:\s*;[^"]*)?|math\/[^"]*)\s*"|'\s*(?:application\/(?:ld\+)?json(?:\s*;[^']*)?|math\/[^']*)\s*'|(?:application\/(?:ld\+)?json(?:;\S*)?|math\/\S*)(?=\s|$))/i;

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

const MIN_TRACKED_TAG_LENGTH = 3; // "xmp", "svg"
const MAX_TRACKED_TAG_LENGTH = 9; // "plaintext"

function isAsciiAlpha(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90) // A-Z
  );
}

function isAsciiAlphaRange(html: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (!isAsciiAlpha(html.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

function isAsciiWhitespace(code: number): boolean {
  return (
    code === 32 || // space
    code === 9 || // \t
    code === 10 || // \n
    code === 12 || // \f
    code === 13 // \r
  );
}

function isTagBoundaryChar(code: number): boolean {
  return code === 62 || code === 47 || isAsciiWhitespace(code);
}

/**
 * Finds the closing `>` of an HTML start tag starting after the tag name,
 * following HTML5 attribute tokenization states:
 * - Only quotes in the before-attribute-value state (after `=`) open a quoted
 *   attribute value (skipped with native `indexOf` for large data URIs).
 * - Quotes inside unquoted attribute values (e.g. `media=x"`) stay in the
 *   unquoted value and still close at the next `>`.
 * Returns -1 if unclosed.
 */
function findStartTagEnd(html: string, start: number): number {
  const len = html.length;
  // 0 = before attr name, 1 = attr name, 2 = after attr name,
  // 3 = before attr value, 4 = unquoted attr value
  let state = 0;
  for (let i = start; i < len; i++) {
    const code = html.charCodeAt(i);
    if (code === 62) {
      // >
      return i;
    }
    if (state === 0) {
      if (!isAsciiWhitespace(code) && code !== 47) {
        state = 1;
      }
    } else if (state === 1) {
      if (code === 61) {
        // =
        state = 3;
      } else if (isAsciiWhitespace(code)) {
        state = 2;
      } else if (code === 47) {
        state = 0;
      }
    } else if (state === 2) {
      if (code === 61) {
        // =
        state = 3;
      } else if (code === 47) {
        state = 0;
      } else if (!isAsciiWhitespace(code)) {
        state = 1;
      }
    } else if (state === 3) {
      if (isAsciiWhitespace(code)) {
        continue;
      }
      if (code === 34 || code === 39) {
        // " or ' — skip quoted attribute values with native indexOf so large
        // data-URI attributes don't scan character by character.
        const closeQuote = html.indexOf(code === 34 ? '"' : "'", i + 1);
        if (closeQuote === -1) {
          return -1;
        }
        i = closeQuote;
        state = 0;
      } else {
        state = 4;
      }
    } else if (isAsciiWhitespace(code)) {
      // state === 4 (unquoted attr value)
      state = 0;
    }
  }
  return -1;
}

function matchesAsciiLowerTagAt(
  html: string,
  offset: number,
  tagName: string,
): boolean {
  const nameLen = tagName.length;
  const afterName = offset + nameLen;
  if (
    afterName >= html.length ||
    !isTagBoundaryChar(html.charCodeAt(afterName))
  ) {
    return false;
  }
  for (let j = 0; j < nameLen; j++) {
    if ((html.charCodeAt(offset + j) | 32) !== tagName.charCodeAt(j)) {
      return false;
    }
  }
  return true;
}

/**
 * Finds the start and end (exclusive) indices of a matching closing tag
 * `</tagName...>` directly in `html` without allocating a lowercased copy.
 * `tagName` must consist strictly of lowercase ASCII letters (`a-z`).
 * Strictly linear across the document.
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
    if (matchesAsciiLowerTagAt(html, idx + 2, tagName)) {
      const gt = html.indexOf(">", idx + 2 + nameLen);
      return gt === -1 ? null : { start: idx, end: gt + 1 };
    }
    searchFrom = idx + 2;
  }
  return null;
}

/**
 * Finds the closing `</script>` tag while respecting the HTML5 script-data
 * escaped and double-escaped states (so `<!--<script>...</script>` inside a
 * preserved script doesn't prematurely end the element). Uses the fast
 * `findCloseTag` path whenever no `<!--` precedes the first `</script>`.
 */
function findScriptCloseTag(
  html: string,
  contentStart: number,
): { start: number; end: number } | null {
  const firstClose = findCloseTag(html, "script", contentStart);
  if (!firstClose) {
    return null;
  }
  const firstComment = html.indexOf("<!--", contentStart);
  if (firstComment === -1 || firstComment > firstClose.start) {
    return firstClose;
  }

  const len = html.length;
  let escaped = false;
  let doubleEscaped = false;
  let pos = firstComment;
  // Cache the next `-->` position so a script with many `<` and no `-->`
  // stays strictly O(n) instead of rescanning to EOF on every `<`.
  let nextCommentEnd = html.indexOf("-->", firstComment + 4);

  while (pos < len) {
    const nextLt = html.indexOf("<", pos);
    if (escaped && nextCommentEnd !== -1 && nextCommentEnd < pos) {
      nextCommentEnd = html.indexOf("-->", pos);
    }

    if (
      escaped &&
      nextCommentEnd !== -1 &&
      (nextLt === -1 || nextCommentEnd < nextLt)
    ) {
      escaped = false;
      doubleEscaped = false;
      pos = nextCommentEnd + 3;
      continue;
    }
    if (nextLt === -1) {
      return null;
    }

    if (
      !escaped &&
      nextLt + 3 < len &&
      html.charCodeAt(nextLt + 1) === 33 && // !
      html.charCodeAt(nextLt + 2) === 45 && // -
      html.charCodeAt(nextLt + 3) === 45 // -
    ) {
      escaped = true;
      pos = nextLt + 4;
      continue;
    }

    if (
      escaped &&
      !doubleEscaped &&
      matchesAsciiLowerTagAt(html, nextLt + 1, "script")
    ) {
      doubleEscaped = true;
      pos = nextLt + 7; // "<script".length
      continue;
    }

    if (
      nextLt + 1 < len &&
      html.charCodeAt(nextLt + 1) === 47 && // /
      matchesAsciiLowerTagAt(html, nextLt + 2, "script")
    ) {
      if (doubleEscaped) {
        doubleEscaped = false;
        pos = nextLt + 8; // "</script".length
        continue;
      }
      const gt = html.indexOf(">", nextLt + 8);
      return gt === -1 ? null : { start: nextLt, end: gt + 1 };
    }

    pos = nextLt + 1;
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
  let foreignDepth = 0;

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

    // CDATA section (e.g. inside SVG/MathML foreign content): skip verbatim to `]]>`
    if (lt + 8 < len && html.startsWith("<![CDATA[", lt)) {
      const cdataEnd = html.indexOf("]]>", lt + 9);
      if (cdataEnd === -1) {
        break;
      }
      pos = cdataEnd + 3;
      continue;
    }

    // Closing tag: track exiting `<svg>` / `<math>` foreign content.
    if (
      lt + 2 < len &&
      html.charCodeAt(lt + 1) === 47 && // /
      isAsciiAlpha(html.charCodeAt(lt + 2))
    ) {
      let closeNameEnd = lt + 3;
      while (
        closeNameEnd < len &&
        !isTagBoundaryChar(html.charCodeAt(closeNameEnd))
      ) {
        closeNameEnd++;
      }
      if (foreignDepth > 0) {
        const closeNameLen = closeNameEnd - (lt + 2);
        if (
          (closeNameLen === 3 || closeNameLen === 4) &&
          isAsciiAlphaRange(html, lt + 2, closeNameEnd)
        ) {
          const closeName = html.slice(lt + 2, closeNameEnd).toLowerCase();
          if (closeName === "svg" || closeName === "math") {
            foreignDepth--;
          }
        }
      }
      const closeEnd = html.indexOf(">", closeNameEnd);
      if (closeEnd === -1) {
        break;
      }
      pos = closeEnd + 1;
      continue;
    }

    // HTML tag names must begin with an ASCII letter (e.g. `<3` is plain text).
    if (lt + 1 >= len || !isAsciiAlpha(html.charCodeAt(lt + 1))) {
      pos = lt + 1;
      continue;
    }

    // Read full HTML tag name up to whitespace, `/`, or `>` (includes
    // namespaced/custom names like `o:p` or `foo_bar`).
    let nameEnd = lt + 2;
    while (nameEnd < len && !isTagBoundaryChar(html.charCodeAt(nameEnd))) {
      nameEnd++;
    }

    const startTagEnd = findStartTagEnd(html, nameEnd);
    if (startTagEnd === -1) {
      // Unclosed start tag: stop stripping to avoid guessing.
      break;
    }

    const nameLen = nameEnd - (lt + 1);
    if (
      nameLen < MIN_TRACKED_TAG_LENGTH ||
      nameLen > MAX_TRACKED_TAG_LENGTH ||
      !isAsciiAlphaRange(html, lt + 1, nameEnd)
    ) {
      pos = startTagEnd + 1;
      continue;
    }

    // Safe to call `.toLowerCase()` here: `isAsciiAlphaRange` guarantees pure ASCII.
    const tagName = html.slice(lt + 1, nameEnd).toLowerCase();
    const isSelfClosing = html.charCodeAt(startTagEnd - 1) === 47; // /

    if (tagName === "svg" || tagName === "math") {
      if (!isSelfClosing) {
        foreignDepth++;
      }
      pos = startTagEnd + 1;
      continue;
    }

    if (tagName === "plaintext") {
      // HTML tokenizer switches permanently to PLAINTEXT state until EOF.
      break;
    }

    const isStyle = tagName === "style";
    const isScript = tagName === "script";
    if (!isStyle && !isScript && !RAW_TEXT_SKIP_TAGS.has(tagName)) {
      // Skip the entire opening tag (including quoted attributes that may
      // contain literal `<style>` / `<script>` examples).
      pos = startTagEnd + 1;
      continue;
    }

    // In foreign content (`<svg>` / `<math>`), self-closing `<style/>` or
    // `<script/>` closes immediately with no matching end tag.
    if (foreignDepth > 0 && isSelfClosing) {
      let shouldStrip = false;
      if (isStyle && opts.stripStyles) {
        shouldStrip = true;
      } else if (isScript && opts.stripNonDataScripts) {
        const attrs = html.slice(nameEnd, startTagEnd - 1);
        shouldStrip = !shouldKeepScript(attrs, "");
      }
      if (shouldStrip) {
        if (lt > copyFrom) {
          out.push(html.slice(copyFrom, lt));
        }
        copyFrom = startTagEnd + 1;
      }
      pos = startTagEnd + 1;
      continue;
    }

    const contentStart = startTagEnd + 1;
    const closeTag = isScript
      ? findScriptCloseTag(html, contentStart)
      : findCloseTag(html, tagName, contentStart);
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
 * Prepares an in-memory copy of HTML for metadata and content extraction:
 * - Replaces embedded `data:audio/` and `data:video/` URIs (from full-page
 *   archives) to avoid DOM memory amplification.
 * - Strips `<style>` blocks (including the adblocker's cosmetic filter sheet)
 *   and non-data `<script>` blocks, while preserving JSON-LD, JSON data, math,
 *   and site-extractor scripts needed by metascraper and Defuddle.
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
      stripNonDataScripts: true,
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
