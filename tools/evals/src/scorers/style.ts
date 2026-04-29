import type { ZTagStyle } from "@karakeep/shared/types/users";

import type { ScoreResult } from "./index";

const styleRegexMap: Record<ZTagStyle, RegExp | null> = {
  "lowercase-hyphens": /^[a-z0-9]+(-[a-z0-9]+)*$/,
  "lowercase-spaces": /^[a-z0-9]+( [a-z0-9]+)*$/,
  "lowercase-underscores": /^[a-z0-9]+(_[a-z0-9]+)*$/,
  "titlecase-spaces": /^[A-Z][a-zA-Z0-9]*( [A-Z][a-zA-Z0-9]*)*$/,
  "titlecase-hyphens": /^[A-Z][a-zA-Z0-9]*(-[A-Z][a-zA-Z0-9]*)*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  "as-generated": null, // No constraint
};

/**
 * Score whether tags conform to the requested tag style.
 * Returns the fraction of tags that match the style regex.
 */
export function scoreStyle(tags: string[], style: ZTagStyle): ScoreResult {
  const regex = styleRegexMap[style];

  if (!regex) {
    return {
      score: 1.0,
      passed: true,
      explanation: `Style "${style}" has no format constraint`,
    };
  }

  if (tags.length === 0) {
    return {
      score: 1.0,
      passed: true,
      explanation: "No tags to validate",
    };
  }

  const matches = tags.filter((tag) => regex.test(tag));
  const violations = tags.filter((tag) => !regex.test(tag));
  const score = matches.length / tags.length;

  return {
    score,
    passed: score >= 0.8,
    explanation:
      violations.length > 0
        ? `Style violations for "${style}": ${violations.map((v) => `"${v}"`).join(", ")}`
        : `All ${tags.length} tags match "${style}" style`,
  };
}
