// Badge count cache helpers
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { getPluginSettings } from "./settings";
import { getApiClient, getQueryClient } from "./trpc";

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
    throw new Error("[badgeCache] API client not configured");
  }
  try {
    const data = await api.bookmarks.searchBookmarks.query({
      text: "url:" + url,
    });
    const bookmarks = data.bookmarks;
    const bookmarksLength = bookmarks.length;
    if (bookmarksLength === 0) {
      return EMPTY_BADGE_STATUS;
    }
    const exactMatch =
      bookmarks.find(
        (b) => b.content.type === BookmarkTypes.LINK && url === b.content.url,
      ) || null;
    return {
      count: bookmarksLength,
      exactMatch,
    };
  } catch (error) {
    console.error(`[badgeCache] Failed to fetch status for ${url}:`, error);
    // In case of API error, return a non-cacheable empty status
    // Propagate so cache treats this as a miss and doesn’t store
    throw error;
  }
}

/**
 * Get badge status for a URL using the SWR cache.
 * @param url The URL to get the status for.
 */
export async function getBadgeStatus(url: string): Promise<BadgeStatus | null> {
  const { useBadgeCache } = await getPluginSettings();
  if (!useBadgeCache) return fetchBadgeStatus(url);

  const queryClient = await getQueryClient();
  if (!queryClient) return null;

  return await queryClient.fetchQuery({
    queryKey: ["badgeStatus", url],
    queryFn: () => fetchBadgeStatus(url),
  });
}

/**
 * Clear badge status cache for a specific URL or all URLs.
 * @param url The URL to clear. If not provided, clears the entire cache.
 */
export async function clearBadgeStatus(url?: string): Promise<void> {
  const queryClient = await getQueryClient();
  if (!queryClient) return;

  if (url) {
    await queryClient.invalidateQueries({ queryKey: ["badgeStatus", url] });
  } else {
    await queryClient.invalidateQueries({ queryKey: ["badgeStatus"] });
  }
  console.log(`[badgeCache] Invalidated cache for: ${url || "all"}`);
}
