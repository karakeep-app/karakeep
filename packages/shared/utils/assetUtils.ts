export function getAssetUrl(assetId: string) {
  return `/api/assets/${assetId}`;
}

const ASSET_URL_REGEX =
  /\/api\/assets\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;

/**
 * Extracts the ids of all assets referenced via getAssetUrl-style URLs
 * (e.g. images embedded in note markdown) from a piece of text content.
 */
export function getAssetIdsFromContent(content: string): Set<string> {
  const ids = new Set<string>();
  for (const match of content.matchAll(ASSET_URL_REGEX)) {
    ids.add(match[1]);
  }
  return ids;
}
