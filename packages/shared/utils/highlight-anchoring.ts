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
 * Converts a [start, end) range in normalized space to raw offsets. Callers
 * must pass a range that doesn't start or end on a collapsed whitespace run,
 * otherwise the raw range would cover only part of that run.
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
 *  4. Look for the stored prefix and suffix and take whatever is between
 *     them, provided its length is reasonably close to the original quote.
 *     This recovers quotes that were edited, and wins over an exact match
 *     from step 3 whose context matches less well.
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
  const untrimmedQuote = normalize(quote);
  const normQuote = untrimmedQuote.trim();
  if (!normQuote) return null;
  // Whitespace trimmed off the edges of the quote moves into its context, so
  // the context still sits right next to the trimmed quote.
  const normPrefix = normalize(
    prefix + (untrimmedQuote.startsWith(" ") ? " " : ""),
  );
  const normSuffix = normalize(
    (untrimmedQuote.endsWith(" ") ? " " : "") + suffix,
  );

  // Number of context characters around normalized [start, end) that agree
  // with the stored prefix/suffix.
  const contextScore = (start: number, end: number) =>
    commonSuffixLength(
      norm.text.slice(Math.max(0, start - normPrefix.length), start),
      normPrefix,
    ) +
    commonPrefixLength(
      norm.text.slice(end, end + normSuffix.length),
      normSuffix,
    );
  // Distance from the stored offset, measured in raw space so that whitespace
  // elsewhere in the document doesn't skew it.
  const distanceFromStored = (start: number) =>
    Math.abs(norm.map[start] - startOffset);

  let exact: { start: number; end: number; score: number } | null = null;
  let bestExactRank = -Infinity;
  for (const pos of findAll(norm.text, normQuote)) {
    const end = pos + normQuote.length;
    const score = contextScore(pos, end);
    // Distance only breaks ties between equally good context matches:
    // it's in (0, 1] so it never outweighs a single matching context char.
    const rank = score + 1 / (1 + distanceFromStored(pos));
    if (rank > bestExactRank) {
      bestExactRank = rank;
      exact = { start: pos, end, score };
    }
  }

  const recovered = recoverFromContext();
  if (recovered && (!exact || recovered.score > exact.score)) {
    return toRawRange(norm, recovered.start, recovered.end);
  }
  return exact ? toRawRange(norm, exact.start, exact.end) : null;

  function recoverFromContext() {
    const trimmedPrefix = normPrefix.trimStart();
    const trimmedSuffix = normSuffix.trimEnd();
    if (trimmedPrefix.length < 8 || trimmedSuffix.length < 8) {
      // Not enough context to confidently relocate.
      return null;
    }
    const minLen = Math.floor(normQuote.length * 0.5);
    const maxLen = Math.ceil(normQuote.length * 1.5) + 2;
    let best: { start: number; end: number } | null = null;
    let bestDistance = Infinity;
    for (const p of findAll(norm.text, trimmedPrefix)) {
      let start = p + trimmedPrefix.length;
      let end = norm.text.indexOf(trimmedSuffix, start);
      if (end === -1) continue;
      // Trim whitespace at the edges of the recovered range.
      while (start < end && norm.text[start] === " ") start++;
      while (end > start && norm.text[end - 1] === " ") end--;
      const len = end - start;
      if (len === 0 || len < minLen || len > maxLen) continue;
      const distance = distanceFromStored(start);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { start, end };
      }
    }
    return best ? { ...best, score: contextScore(best.start, best.end) } : null;
  }
}
