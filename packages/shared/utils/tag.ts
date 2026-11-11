import type { ZTagStyle } from "../types/users";

/**
 * Ensures exactly ONE leading #
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, ""); // strip every leading #
}

export type TagStyle = ZTagStyle;

export function getTagStylePrompt(style: TagStyle): string {
  switch (style) {
    case "lowercase-hyphens":
      return "- Use lowercase letters with hyphens between words (e.g., 'machine-learning', 'web-development')";
    case "lowercase-spaces":
      return "- Use lowercase letters with spaces between words (e.g., 'machine learning', 'web development')";
    case "lowercase-underscores":
      return "- Use lowercase letters with underscores between words (e.g., 'machine_learning', 'web_development')";
    case "titlecase-spaces":
      return "- Use title case with spaces between words (e.g., 'Machine Learning', 'Web Development')";
    case "titlecase-hyphens":
      return "- Use title case with hyphens between words (e.g., 'Machine-Learning', 'Web-Development')";
    case "camelCase":
      return "- Use camelCase format (e.g., 'machineLearning', 'webDevelopment')";
    case "as-generated":
    default:
      return "";
  }
}

export function getCuratedTagsPrompt(curatedTags?: string[]): string {
  if (curatedTags && curatedTags.length > 0) {
    return `- ONLY use tags from this predefined list: [${curatedTags.join(", ")}]. Do not create any new tags outside this list. If no tags fit, don't emit any.`;
  }
  return "";
}

// Same rule as the generated `normalizedName` column on `bookmarkTags`, which
// is what decides whether an inferred tag matches an existing one.
function normalizeTagForMatching(tag: string): string {
  return tag.toLowerCase().replace(/[ \-_]/g, "");
}

/**
 * Keeps only the inferred tags that are on the curated list. The prompt asks
 * the model to stay on the list, but models don't always comply, and anything
 * off the list would otherwise be created as a new tag. Matching follows tag
 * normalization (case, spaces, hyphens and underscores are ignored); kept tags
 * take the curated spelling and are deduplicated.
 */
export function filterToCuratedTags(
  inferredTags: string[],
  curatedTags: string[],
): { kept: string[]; dropped: string[] } {
  const curatedByNormalized = new Map(
    curatedTags.map((t) => [normalizeTagForMatching(t), t]),
  );
  const kept = new Set<string>();
  const dropped: string[] = [];
  for (const tag of inferredTags) {
    const curated = curatedByNormalized.get(normalizeTagForMatching(tag));
    if (curated === undefined) {
      dropped.push(tag);
    } else {
      kept.add(curated);
    }
  }
  return { kept: [...kept], dropped };
}

export function getPotentialRelevantTagsPrompt(
  potentialRelevantTags?: string[],
): string {
  if (potentialRelevantTags && potentialRelevantTags.length > 0) {
    return `- Similar bookmarks were tagged with the following tags (reuse if possible, ignore if irrelevant): ${potentialRelevantTags.join(", ")}`;
  }
  return "";
}
