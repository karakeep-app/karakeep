/**
 * Text-quote anchoring for highlights.
 *
 * Highlights store raw character offsets into the reader's text content, but
 * offsets break as soon as anything before the highlight changes (re-crawls,
 * readability tweaks, sanitizer changes, whitespace differences...). To make
 * them robust we also store the highlighted text (the "quote") along with a
 * bit of surrounding context (prefix/suffix), similar to the W3C
 * TextQuoteSelector. At render time we search for the quote in the current
 * text and use the context + the old offset to disambiguate between multiple
 * occurrences. Offsets are then only a hint.
 */

/** Number of characters of context stored on each side of a highlight. */
export const HIGHLIGHT_CONTEXT_LENGTH = 32;

export interface HighlightAnchor {
  startOffset: number;
  endOffset: number;
  text?: string | null;
  prefix?: string | null;
  suffix?: string | null;
}

export interface ResolvedHighlightRange {
  startOffset: number;
  endOffset: number;
}

/**
 * Extracts the prefix/suffix context around [start, end) of `fullText`.
 */
export function getHighlightContext(
  fullText: string,
  startOffset: number,
  endOffset: number,
): { prefix: string; suffix: string } {
  return {
    prefix: fullText.slice(
      Math.max(0, startOffset - HIGHLIGHT_CONTEXT_LENGTH),
      startOffset,
    ),
    suffix: fullText.slice(endOffset, endOffset + HIGHLIGHT_CONTEXT_LENGTH),
  };
}

/**
 * Whitespace-collapsed view of a string, with a mapping from each normalized
 * index back to the index in the original string. This lets us match quotes
 * even if the amount/kind of whitespace in the document changed.
 */
interface NormalizedText {
  text: string;
  /** map[i] is the raw index of normalized char i; map[text.length] is raw length. */
  map: number[];
}

// The same document text is typically resolved against many highlights in a
// row, so remember the last normalization.
let lastNormalized: { raw: string; result: NormalizedText } | null = null;

function normalizeWithMap(raw: string): NormalizedText {
  if (lastNormalized?.raw === raw) {
    return lastNormalized.result;
  }
  let text = "";
  const map: number[] = [];
  let inWhitespace = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      if (!inWhitespace) {
        text += " ";
        map.push(i);
        inWhitespace = true;
      }
      continue;
    }
    inWhitespace = false;
    text += ch;
    map.push(i);
  }
  map.push(raw.length);
  const result = { text, map };
  lastNormalized = { raw, result };
  return result;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ");
}

/** Length of the common suffix of a and b. */
function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  while (
    n < a.length &&
    n < b.length &&
    a[a.length - 1 - n] === b[b.length - 1 - n]
  ) {
    n++;
  }
  return n;
}

/** Length of the common prefix of a and b. */
function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) {
    n++;
  }
  return n;
}

function findAll(haystack: string, needle: string): number[] {
  const result: number[] = [];
  if (!needle) return result;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    result.push(idx);
    idx = haystack.indexOf(needle, idx + 1);
  }
  return result;
}

/**
 * Converts a [start, end) range in normalized space to raw offsets. Leading
 * and trailing whitespace is trimmed so that the range never starts/ends on
 * a collapsed whitespace run.
 */
function toRawRange(
  norm: NormalizedText,
  start: number,
  end: number,
): ResolvedHighlightRange {
  const rawStart = norm.map[start];
  // map[end - 1] is the raw index of the last matched char; +1 makes it exclusive.
  const rawEnd = end > start ? norm.map[end - 1] + 1 : rawStart;
  return { startOffset: rawStart, endOffset: rawEnd };
}

/**
 * Finds the current location of a highlight in `fullText`.
 *
 * Resolution order:
 *  1. If there's no stored quote, trust the offsets (legacy behaviour).
 *  2. If the quote still sits exactly at the stored offsets, and its context
 *     (when stored) agrees, use the offsets as-is.
 *  3. Search for every occurrence of the (whitespace-normalized) quote and
 *     pick the one whose surrounding context best matches the stored
 *     prefix/suffix, using distance from the old offset as a tie-breaker.
 *  4. If the quote itself no longer exists, look for the stored prefix and
 *     suffix and take whatever is between them, provided its length is
 *     reasonably close to the original quote.
 *
 * Returns null if the highlight can't be located anymore.
 */
export function resolveHighlightRange(
  fullText: string,
  anchor: HighlightAnchor,
): ResolvedHighlightRange | null {
  const { startOffset, endOffset } = anchor;
  const quote = anchor.text;

  if (!quote) {
    if (startOffset < 0 || endOffset > fullText.length) return null;
    return { startOffset, endOffset };
  }

  const prefix = anchor.prefix ?? "";
  const suffix = anchor.suffix ?? "";

  // Fast path: nothing moved.
  if (fullText.slice(startOffset, endOffset) === quote) {
    const ctx = getHighlightContext(fullText, startOffset, endOffset);
    const contextMatches =
      (!anchor.prefix || ctx.prefix === prefix) &&
      (!anchor.suffix || ctx.suffix === suffix);
    if (contextMatches) {
      return { startOffset, endOffset };
    }
  }

  const norm = normalizeWithMap(fullText);
  const normQuote = normalize(quote).trim();
  const normPrefix = normalize(prefix);
  const normSuffix = normalize(suffix);
  if (!normQuote) return null;

  // Approximate the old offset in normalized space, for distance scoring.
  const approxNormStart = Math.round(
    (startOffset / Math.max(1, fullText.length)) * norm.text.length,
  );

  const candidates = findAll(norm.text, normQuote);
  if (candidates.length > 0) {
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const pos of candidates) {
      const before = norm.text.slice(Math.max(0, pos - normPrefix.length), pos);
      const after = norm.text.slice(
        pos + normQuote.length,
        pos + normQuote.length + normSuffix.length,
      );
      const contextScore =
        commonSuffixLength(before, normPrefix) +
        commonPrefixLength(after, normSuffix);
      // Distance only breaks ties between equally good context matches:
      // it's in [0, 1) so it never outweighs a single matching context char.
      const distance = Math.abs(pos - approxNormStart);
      const score = contextScore + 1 / (1 + distance);
      if (score > bestScore) {
        bestScore = score;
        best = pos;
      }
    }
    return toRawRange(norm, best, best + normQuote.length);
  }

  // The quote itself was edited. Fall back to locating it via its context.
  const trimmedPrefix = normPrefix.trimStart();
  const trimmedSuffix = normSuffix.trimEnd();
  if (trimmedPrefix.length < 8 || trimmedSuffix.length < 8) {
    // Not enough context to confidently relocate.
    return null;
  }
  const minLen = Math.floor(normQuote.length * 0.5);
  const maxLen = Math.ceil(normQuote.length * 1.5) + 2;
  let bestRange: { start: number; end: number } | null = null;
  let bestDistance = Infinity;
  for (const p of findAll(norm.text, trimmedPrefix)) {
    const start = p + trimmedPrefix.length;
    const s = norm.text.indexOf(trimmedSuffix, start);
    if (s === -1) continue;
    const len = s - start;
    if (len < minLen || len > maxLen) continue;
    const distance = Math.abs(start - approxNormStart);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRange = { start, end: s };
    }
  }
  if (!bestRange) return null;

  // Trim whitespace at the edges of the recovered range.
  let { start, end } = bestRange;
  while (start < end && norm.text[start] === " ") start++;
  while (end > start && norm.text[end - 1] === " ") end--;
  if (start === end) return null;
  return toRawRange(norm, start, end);
}
