// Badge count cache helpers
import { getPluginSettings } from "./settings";
import { getApiClient, getQueryClient } from "./trpc";

/**
 * Fetches the bookmark status for a given URL from the API.
 * This function will be used by our cache as the "fetcher".
 * @param url The URL to check.
 * @returns The bookmark id if found, null if not found.
 */
async function fetchBadgeStatus(url: string): Promise<string | null> {
  const api = await getApiClient();
  if (!api) {
    // This case should ideally not happen if settings are correct
    throw new Error("[badgeCache] API client not configured");
  }
  try {
    const data = await api.bookmarks.checkUrl.query({ url });
    return data.bookmarkId;
  } catch (error) {
    console.error(`[badgeCache] Failed to fetch status for ${url}:`, error);
    // In case of API error, return a non-cacheable empty status
    // Propagate so cache treats this as a miss and doesn't store
    throw error;
  }
}

/**
 * Get badge status for a URL using the SWR cache.
 * @param url The URL to get the status for.
 */
export async function getBadgeStatus(url: string): Promise<string | null> {
  const { useBadgeCache, badgeCacheExpireMs } = await getPluginSettings();
  if (!useBadgeCache) return fetchBadgeStatus(url);

  const queryClient = await getQueryClient();
  if (!queryClient) return fetchBadgeStatus(url);

  return await queryClient.fetchQuery({
    queryKey: ["badgeStatus", url],
    queryFn: () => fetchBadgeStatus(url),
    // Keep in memory for twice as long as stale time
    gcTime: badgeCacheExpireMs * 2,
    // Use the user-configured cache expire time
    staleTime: badgeCacheExpireMs,
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
