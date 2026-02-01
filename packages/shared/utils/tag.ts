import type { ZTagGranularity, ZTagStyle } from "../types/users";

/**
 * Ensures exactly ONE leading #
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, ""); // strip every leading #
}

export type TagStyle = ZTagStyle;
export type TagGranularity = ZTagGranularity;

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

export function getTagGranularityPrompt(
  granularity: TagGranularity,
  curatedTags?: string[],
  isImage?: boolean,
): string {
  switch (granularity) {
    case "comprehensive":
      return isImage
        ? "- Aim for 10-15 tags, including broad categories, specific keywords, and potential sub-genres."
        : "- Aim for 8-12 tags, including broad categories, specific keywords, and potential sub-genres.";
    case "focused":
      return "- Aim for 3-5 essential tags that capture only the most important themes.";
    case "curated":
      if (curatedTags && curatedTags.length > 0) {
        return `- ONLY use tags from this predefined list: [${curatedTags.join(", ")}]. Do not create any new tags outside this list. If the content does not match any of the tags in the list, return an empty list.`;
      }
      // Fallback if no curated tags are configured
      return "- Aim for 3-5 tags.";
    default:
      return "- Aim for 3-5 tags.";
  }
}
