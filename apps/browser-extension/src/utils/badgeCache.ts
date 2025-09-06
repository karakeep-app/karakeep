// Badge count cache helpers (chrome.storage.local async, shared)
// Implements dual-layer SWR (memory + persistent) cache for badge status.
import type { BadgeCacheEntry, BadgeCacheStorage } from "../types/cache";
import { DEFAULT_BADGE_CACHE_EXPIRE_MS, getPluginSettings } from "./settings";
import { getStorageValue, removeStorageKey, setStorageValue } from "./storage";

const BADGE_CACHE_KEY = "karakeep-badge-count-cache";
const LAST_PURGE_KEY = "badgeCacheLastPurge";

/**
 * Get badge cache expire time from settings
 */
async function getBadgeCacheExpireMs(): Promise<number> {
  try {
    const settings = await getPluginSettings();
    return settings.badgeCacheExpireMs ?? DEFAULT_BADGE_CACHE_EXPIRE_MS;
  } catch (error) {
    console.error(
      "Failed to get badge cache expire time from settings, using default:",
      error,
    );
    return DEFAULT_BADGE_CACHE_EXPIRE_MS;
  }
}

// 1. Memory cache (L1): fastest synchronous access
const badgeMemoryCache = new Map<string, BadgeCacheEntry>();

// 2. Async write queue to prevent concurrent writes to chrome.storage
let storageWritePromiseQueue: Promise<void> = Promise.resolve();

/**
 * Get the entire badge cache object from storage
 */
async function getBadgeCacheFromStorage(): Promise<BadgeCacheStorage> {
  return await getStorageValue(BADGE_CACHE_KEY, {});
}

/**
 * Set the entire badge cache object to storage
 */
async function setBadgeCacheToStorage(cache: BadgeCacheStorage): Promise<void> {
  await setStorageValue(BADGE_CACHE_KEY, cache);
}

/**
 * Get the last time the badge cache was purged
 */
async function getLastPurgeTimestamp(): Promise<number> {
  return await getStorageValue(LAST_PURGE_KEY, 0);
}

/**
 * Set the last time the badge cache was purged
 */
async function setLastPurgeTimestamp(ts: number): Promise<void> {
  await setStorageValue(LAST_PURGE_KEY, ts);
}

/**
 * Purge stale entries from a badge cache object
 * @param cacheObj
 * @param expireMs The cache expiration time in milliseconds
 */
function purgeStaleFromObject(
  cacheObj: BadgeCacheStorage,
  expireMs: number,
): BadgeCacheStorage {
  const now = Date.now();
  const newCache: BadgeCacheStorage = {};
  for (const key in cacheObj) {
    if (
      Object.prototype.hasOwnProperty.call(cacheObj, key) &&
      now - cacheObj[key].ts <= expireMs
    ) {
      newCache[key] = cacheObj[key];
    }
  }
  return newCache;
}

/**
 * Purge stale badge cache from memory and persistent storage
 */
export async function purgeStaleBadgeCache() {
  console.log(
    "[badgeCache] purgeStaleBadgeCache: cleaning up stale badge cache...",
  );
  // Get current cache expiration time
  const expireMs = await getBadgeCacheExpireMs();
  // 1. Purge memory cache
  const now = Date.now();
  for (const [key, entry] of badgeMemoryCache.entries()) {
    if (now - entry.ts > expireMs) {
      badgeMemoryCache.delete(key);
    }
  }
  // 2. Purge persistent storage (queued for safety)
  storageWritePromiseQueue = storageWritePromiseQueue.then(async () => {
    try {
      const storageCache = await getBadgeCacheFromStorage();
      const freshStorageCache = purgeStaleFromObject(storageCache, expireMs);
      // Only write if cache content changed
      if (
        Object.keys(freshStorageCache).length !==
        Object.keys(storageCache).length
      ) {
        await setBadgeCacheToStorage(freshStorageCache);
      }
    } catch (err) {
      console.error("Failed to purge stale badge cache from storage:", err);
    }
  });
  await storageWritePromiseQueue;
}

// --- Public API ---
/**
 * Check if enough time has passed to trigger a purge and do it if needed.
 */
export async function checkAndPurgeIfNeeded() {
  const expireMs = await getBadgeCacheExpireMs();
  const now = Date.now();
  const lastPurgeTimestamp = await getLastPurgeTimestamp();
  if (now - lastPurgeTimestamp > expireMs) {
    await purgeStaleBadgeCache();
    await setLastPurgeTimestamp(now);
  }
}

/**
 * Get badge status for a URL using SWR strategy.
 * Returns cached data and marks whether it is fresh.
 */
export async function getBadgeStatusSWR(url: string) {
  console.log(`[badgeCache] getBadgeStatusSWR: key=${url}`);
  const expireMs = await getBadgeCacheExpireMs();
  // 1. Check memory cache (L1)
  const memEntry = badgeMemoryCache.get(url);
  if (memEntry) {
    const isFresh = Date.now() - memEntry.ts < expireMs;
    console.log(
      `[badgeCache] getBadgeStatusSWR memory cache hit: key=${url}, value=`,
      memEntry,
    );
    return { ...memEntry, source: "memory", fresh: isFresh };
  }
  // 2. Check persistent storage (L2)
  try {
    const storageCache = await getBadgeCacheFromStorage();
    const storageEntry = storageCache[url];
    if (storageEntry) {
      badgeMemoryCache.set(url, storageEntry);
      const isFresh = Date.now() - storageEntry.ts < expireMs;
      console.log(
        `[badgeCache] getBadgeStatusSWR storage cache hit: key=${url}, value=`,
        storageEntry,
      );
      return { ...storageEntry, source: "storage", fresh: isFresh };
    }
    // Not found in either cache
    console.log(
      `[badgeCache] getBadgeStatusSWR all cache miss: key=${url}, value=null`,
    );
    return null;
  } catch (err) {
    console.error("Failed to get badge cache from storage:", err);
    return null;
  }
}

/**
 * Set or update badge status for a URL in both caches.
 */
export async function setBadgeStatusSWR(
  url: string,
  count: number,
  isExisted: boolean,
) {
  console.log(`[badgeCache] setBadgeStatusSWR: key=${url}, value=`, {
    count,
    isExisted,
  });
  const entry = { count, isExisted, ts: Date.now() };
  // 1. Update memory cache immediately
  badgeMemoryCache.set(url, entry);
  // 2. Queue write to persistent storage
  storageWritePromiseQueue = storageWritePromiseQueue.then(async () => {
    try {
      const cache = await getBadgeCacheFromStorage();
      cache[url] = entry;
      await setBadgeCacheToStorage(cache);
    } catch (err) {
      console.error("Failed to set badge cache to storage:", err);
    }
  });
  await storageWritePromiseQueue;
}

/**
 * Remove badge status cache for a specific URL or all URLs.
 */
export async function clearBadgeStatusSWR(url?: string) {
  console.log(`[badgeCache] clearBadgeStatusSWR: key=${url}`);
  // 1. Remove from memory cache
  if (url) {
    badgeMemoryCache.delete(url);
  } else {
    badgeMemoryCache.clear();
  }
  // 2. Queue removal from persistent storage
  storageWritePromiseQueue = storageWritePromiseQueue.then(async () => {
    try {
      if (!url) {
        await removeStorageKey(BADGE_CACHE_KEY);
      } else {
        const cache = await getBadgeCacheFromStorage();
        if (cache[url]) {
          delete cache[url];
          await setBadgeCacheToStorage(cache);
        }
      }
    } catch (err) {
      console.error("Failed to clear badge cache from storage:", err);
    }
  });
  await storageWritePromiseQueue;
}
