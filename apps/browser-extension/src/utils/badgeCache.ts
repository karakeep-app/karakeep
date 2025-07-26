// Badge count cache helpers (chrome.storage.local async, shared)
// Implements dual-layer SWR (memory + persistent) cache for badge status.
const BADGE_CACHE_KEY = "karakeep-badge-count-cache";
const BADGE_CACHE_EXPIRE_MS = 60 * 60 * 1000; // 1 hour
const PURGE_ALARM_NAME = "badgeCachePurgeAlarm";

// 1. Memory cache (L1): fastest synchronous access
const badgeMemoryCache = new Map<
  string,
  { count: number; isExisted: boolean; ts: number }
>();

// 2. Async write queue to prevent concurrent writes to chrome.storage
let storageWritePromiseQueue: Promise<void> = Promise.resolve();

// --- Utility Functions ---
// Pure function: remove expired entries from an object
function purgeStaleFromObject(
  cacheObj: Record<string, { ts: number }>,
): Record<string, { ts: number }> {
  const now = Date.now();
  const newCache: Record<string, { ts: number }> = {};
  for (const key in cacheObj) {
    if (
      Object.prototype.hasOwnProperty.call(cacheObj, key) &&
      now - cacheObj[key].ts <= BADGE_CACHE_EXPIRE_MS
    ) {
      newCache[key] = cacheObj[key];
    }
  }
  return newCache;
}

// --- Periodic Purge Task (for use with chrome.alarms) ---
// Removes expired entries from both memory and persistent storage
export async function purgeStaleBadgeCache() {
  console.log(
    "[badgeCache] purgeStaleBadgeCache: cleaning up stale badge cache...",
  );
  // 1. Purge memory cache
  const now = Date.now();
  for (const [key, entry] of badgeMemoryCache.entries()) {
    if (now - entry.ts > BADGE_CACHE_EXPIRE_MS) {
      badgeMemoryCache.delete(key);
    }
  }
  // 2. Purge persistent storage (queued for safety)
  storageWritePromiseQueue = storageWritePromiseQueue.then(async () => {
    try {
      const result = await chrome.storage.local.get(BADGE_CACHE_KEY);
      const storageCache = result[BADGE_CACHE_KEY] || {};
      const freshStorageCache = purgeStaleFromObject(storageCache);
      // Only write if cache content changed
      if (
        Object.keys(freshStorageCache).length !==
        Object.keys(storageCache).length
      ) {
        await chrome.storage.local.set({
          [BADGE_CACHE_KEY]: freshStorageCache,
        });
      }
    } catch (err) {
      console.error("Failed to purge stale badge cache from storage:", err);
    }
  });
  await storageWritePromiseQueue;
}

// --- Public API ---
/**
 * Initialize the badge cache module. Should be called once at background script startup.
 */
export function initializeCache() {
  console.log("[badgeCache] Initializing badge cache...");
  // Set up an hourly alarm for periodic cache purge
  chrome.alarms.get(PURGE_ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(PURGE_ALARM_NAME, {
        periodInMinutes: 10,
      });
    }
  });
}

/**
 * Get badge status for a URL using SWR strategy.
 * Returns cached data and marks whether it is fresh.
 */
export async function getBadgeStatusSWR(url: string) {
  console.log(`[badgeCache] getBadgeStatusSWR: key=${url}`);
  // 1. Check memory cache (L1)
  const memEntry = badgeMemoryCache.get(url);
  if (memEntry) {
    const isFresh = Date.now() - memEntry.ts < BADGE_CACHE_EXPIRE_MS;
    console.log(`[badgeCache] getBadgeStatusSWR: key=${url}, value=`, memEntry);
    return { ...memEntry, source: "memory", fresh: isFresh };
  }
  // 2. Check persistent storage (L2)
  try {
    const result = await chrome.storage.local.get(BADGE_CACHE_KEY);
    const storageCache = result[BADGE_CACHE_KEY] || {};
    const storageEntry = storageCache[url];
    if (storageEntry) {
      badgeMemoryCache.set(url, storageEntry);
      const isFresh = Date.now() - storageEntry.ts < BADGE_CACHE_EXPIRE_MS;
      console.log(
        `[badgeCache] getBadgeStatusSWR: key=${url}, value=`,
        storageEntry,
      );
      return { ...storageEntry, source: "storage", fresh: isFresh };
    }
    // Not found in either cache
    console.log(`[badgeCache] getBadgeStatusSWR: key=${url}, value=null`);
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
      const result = await chrome.storage.local.get(BADGE_CACHE_KEY);
      const cache = result[BADGE_CACHE_KEY] || {};
      cache[url] = entry;
      await chrome.storage.local.set({ [BADGE_CACHE_KEY]: cache });
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
        await chrome.storage.local.remove(BADGE_CACHE_KEY);
      } else {
        const result = await chrome.storage.local.get(BADGE_CACHE_KEY);
        const cache = result[BADGE_CACHE_KEY] || {};
        if (cache[url]) {
          delete cache[url];
          await chrome.storage.local.set({ [BADGE_CACHE_KEY]: cache });
        }
      }
    } catch (err) {
      console.error("Failed to clear badge cache from storage:", err);
    }
  });
  await storageWritePromiseQueue;
}
