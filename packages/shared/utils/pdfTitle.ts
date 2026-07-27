/**
 * ArXiv ids look like `2301.04104` or `2301.04104v2` (optionally with a
 * category prefix such as `hep-th/9901001` for older papers).
 */
// New-style: 2301.04104[vN]. Old-style: hep-th/9901001[vN].
const ARXIV_ID_RE = /^(?:[a-z-]+\/)?(?:\d{4}\.\d{4,5}|\d{7})(?:v\d+)?$/i;

export function looksLikeArxivId(value: string): boolean {
  return ARXIV_ID_RE.test(value.trim());
}

/**
 * Normalize a candidate PDF title. Returns null for empty / whitespace-only
 * strings so callers can fall through to the next source.
 */
export function normalizePdfTitleCandidate(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Titles that are not useful for display — empty, equal to the asset filename,
 * or an opaque arXiv paper id (common browser PDF tab titles).
 */
export function isWeakPdfTitle(
  title: string | null | undefined,
  fileName?: string | null,
): boolean {
  const normalized = normalizePdfTitleCandidate(title);
  if (!normalized) {
    return true;
  }

  const basename = fileName ? pathBasenameWithoutExtension(fileName) : null;
  if (basename && normalized.toLowerCase() === basename.toLowerCase()) {
    return true;
  }
  if (fileName && normalized.toLowerCase() === fileName.toLowerCase()) {
    return true;
  }

  return looksLikeArxivId(normalized);
}

function pathBasenameWithoutExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return base.replace(/\.pdf$/i, "");
}
