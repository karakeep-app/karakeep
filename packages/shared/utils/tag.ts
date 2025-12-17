/**
 * Ensures exactly ONE leading #
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, ""); // strip every leading #
}

/**
 * Normalizes a tag name for database storage and matching.
 * Converts to lowercase and removes spaces, hyphens, and underscores.
 * Used for the normalizedName column to enable efficient case-insensitive matching.
 */
export function normalizeTagForDB(tag: string): string {
  return tag.toLowerCase().replace(/[ \-_]/g, "");
}
