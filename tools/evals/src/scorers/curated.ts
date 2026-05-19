import type { ScoreResult } from "./index";

/**
 * Score whether all generated tags come from the curated tags list.
 */
export function scoreCurated(
  tags: string[],
  curatedTags: string[],
): ScoreResult {
  if (tags.length === 0) {
    return {
      score: 1.0,
      passed: true,
      explanation:
        "No tags generated (acceptable when curated list is restrictive)",
    };
  }

  const curatedSet = new Set(curatedTags.map((t) => t.toLowerCase()));
  const inSet = tags.filter((tag) => curatedSet.has(tag.toLowerCase()));
  const violations = tags.filter((tag) => !curatedSet.has(tag.toLowerCase()));
  const score = inSet.length / tags.length;

  return {
    score,
    passed: score >= 1.0,
    explanation:
      violations.length > 0
        ? `Tags outside curated list: ${violations.map((v) => `"${v}"`).join(", ")}`
        : `All ${tags.length} tags are from the curated list`,
  };
}
