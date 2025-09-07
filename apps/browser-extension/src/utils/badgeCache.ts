// Badge count cache helpers
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { createCache } from "./cache";
import { DEFAULT_BADGE_CACHE_EXPIRE_MS, getPluginSettings } from "./settings";
import { getStorageValue, setStorageValue } from "./storage";
import { getApiClient } from "./trpc";

const BADGE_CACHE_KEY = "karakeep-badge-count-cache";
const LAST_PURGE_KEY = "badgeCacheLastPurge";
const EMPTY_BADGE_STATUS: BadgeStatus = { count: 0, exactMatch: null };

interface BadgeStatus {
  count: number;
  exactMatch: ZBookmark | null;
}

/**
 * Fetches the bookmark status for a given URL from the API.
 * This function will be used by our cache as the "fetcher".
 * @param url The URL to check.
 */
async function fetchBadgeStatus(url: string): Promise<BadgeStatus> {
  const api = await getApiClient();
  if (!api) {
    // This case should ideally not happen if settings are correct
    console.warn(
      "[badgeCache] API client not configured, returning empty status.",
    );
    return EMPTY_BADGE_STATUS;
  }
  try {
    const data = await api.bookmarks.searchBookmarks.query({
      text: "url:" + url,
    });
    if (!data) {
      return EMPTY_BADGE_STATUS;
    }
    const bookmarks = data.bookmarks || [];
    const exactMatch =
      bookmarks.find(
        (b) => b.content.type === BookmarkTypes.LINK && url === b.content.url,
      ) || null;
    return {
      count: bookmarks.length,
      exactMatch,
    };
  } catch (error) {
    console.error(`[badgeCache] Failed to fetch status for ${url}:`, error);
    // In case of API error, return a non-cacheable empty status
    return EMPTY_BADGE_STATUS;
  }
}

// Create a singleton cache instance for the badge status.
let badgeCache: ReturnType<typeof createCache<BadgeStatus>> | null = null;

async function getBadgeCache() {
  if (badgeCache) {
    return badgeCache;
  }
  const expireMs =
    (await getPluginSettings()).badgeCacheExpireMs ??
    DEFAULT_BADGE_CACHE_EXPIRE_MS;

  badgeCache = createCache<BadgeStatus>({
    name: BADGE_CACHE_KEY,
    expireMs,
    fetcher: fetchBadgeStatus,
  });
  return badgeCache;
}

/**
 * Get badge status for a URL using the SWR cache.
 * @param url The URL to get the status for.
 */
export async function getBadgeStatus(url: string): Promise<BadgeStatus | null> {
  const { useBadgeCache } = await getPluginSettings();
  if (!useBadgeCache) return fetchBadgeStatus(url);

  const cache = await getBadgeCache();
  return cache.get(url);
}

/**
 * Clear badge status cache for a specific URL or all URLs.
 * @param url The URL to clear. If not provided, clears the entire cache.
 */
export async function clearBadgeStatus(url?: string): Promise<void> {
  const { useBadgeCache } = await getPluginSettings();
  if (!useBadgeCache) return;

  const cache = await getBadgeCache();
  await cache.clear(url);
  console.log(`[badgeCache] Cleared cache for: ${url || "all"}`);
}

/**
 * Purge stale entries from the badge cache.
 */
async function purgeStaleBadgeCache(): Promise<void> {
  const cache = await getBadgeCache();
  await cache.purgeStale();
  console.log("[badgeCache] Purged stale entries.");
}

/**
 * Check if enough time has passed to trigger a purge and do it if needed.
 */
export async function checkAndPurgeIfNeeded() {
  const { useBadgeCache, badgeCacheExpireMs } = await getPluginSettings();
  if (!useBadgeCache) return;

  const expireMs = badgeCacheExpireMs ?? DEFAULT_BADGE_CACHE_EXPIRE_MS;
  const now = Date.now();
  const lastPurgeTimestamp = await getStorageValue(LAST_PURGE_KEY, 0);

  if (now - lastPurgeTimestamp > expireMs) {
    console.log(
      "[badgeCache] Purge interval reached. Purging stale entries...",
    );
    await purgeStaleBadgeCache();
    await setStorageValue(LAST_PURGE_KEY, now);
  }
}
