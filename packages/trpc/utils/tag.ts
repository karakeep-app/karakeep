/**
 * Ensures exactly ONE leading #
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, ""); // strip every leading #
}
