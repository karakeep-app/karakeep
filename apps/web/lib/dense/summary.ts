/**
 * The design's detail read-out has a `KEY POINTS` block below the summary.
 * Karakeep's data model has no such field — there is only the one free-text
 * `summary` string — so rather than invent points, derive them from the
 * summary when the model happened to write one as a list, and drop the
 * block entirely when it didn't.
 */

const BULLET = /^\s*(?:[-*•–—]|\d+[.)])\s+(.*)$/;

export interface ParsedSummary {
  /** Prose ahead of the list (or the whole summary when there is no list). */
  lead: string | null;
  /** List items, in order. Empty when the summary isn't written as a list. */
  keyPoints: string[];
  /** Prose after the list. Every part of the summary is in exactly one of
   *  these three fields — none of it is dropped. */
  trail: string | null;
}

export function parseSummary(
  summary: string | null | undefined,
): ParsedSummary {
  if (!summary?.trim()) return { lead: null, keyPoints: [], trail: null };

  const lines = summary.split("\n");
  const leadLines: string[] = [];
  const trailLines: string[] = [];
  const keyPoints: string[] = [];

  for (const line of lines) {
    const match = BULLET.exec(line);
    if (match) {
      const text = match[1].trim();
      if (text) keyPoints.push(text);
    } else if (keyPoints.length === 0) {
      leadLines.push(line);
    } else {
      // Prose after the list keeps its position rather than being reordered
      // up into the lead — but it is still shown. Silently discarding part
      // of the summary would be worse than either.
      trailLines.push(line);
    }
  }

  // A single bullet isn't a list — treat it as prose so a one-line summary
  // that merely starts with a dash doesn't render as a lone key point.
  if (keyPoints.length < 2) {
    return { lead: summary.trim(), keyPoints: [], trail: null };
  }

  const lead = leadLines.join("\n").trim();
  const trail = trailLines.join("\n").trim();
  return { lead: lead || null, keyPoints, trail: trail || null };
}

/**
 * One-line-ish summary text for a list row or grid card. Rows have no room
 * for a bulleted block, and rendering the raw markdown there leaks "- " into
 * the middle of the sentence, so use the lead paragraph and fall back to
 * running the points together when the summary is nothing but a list.
 */
export function summaryPreview(
  summary: string | null | undefined,
): string | null {
  // No `trail` case: parseSummary only leaves `lead` empty when it found a
  // list, so the join below always covers it.
  const { lead, keyPoints } = parseSummary(summary);
  if (lead) return lead;
  if (keyPoints.length > 0) return keyPoints.join(" · ");
  return null;
}
