// Generic SWR-enabled cache utility
import { getStorageValue, removeStorageKey, setStorageValue } from "./storage";

interface CacheEntry<T> {
  data: T;
  ts: number;
}

type CacheStorage<T> = Record<string, CacheEntry<T>>;

interface CacheOptions<T> {
  name: string;
  expireMs: number;
  fetcher: (key: string) => Promise<T>;
}

export function createCache<T>({ name, expireMs, fetcher }: CacheOptions<T>) {
  const memoryCache = new Map<string, CacheEntry<T>>();
  let storageWritePromiseQueue: Promise<void> = Promise.resolve();

  const getCacheFromStorage = async (): Promise<CacheStorage<T>> => {
    return await getStorageValue(name, {});
  };

  const setCacheToStorage = async (cache: CacheStorage<T>): Promise<void> => {
    await setStorageValue(name, cache);
  };

  const get = async (key: string): Promise<T | null> => {
    // 1. Check memory cache (L1)
    const memEntry = memoryCache.get(key);
    if (memEntry) {
      const isFresh = Date.now() - memEntry.ts < expireMs;
      if (!isFresh) {
        // Revalidate in background, but return stale data immediately
        void fetcher(key).then((newData) => set(key, newData));
      }
      return memEntry.data;
    }

    // 2. Check persistent storage (L2)
    try {
      const storageCache = await getCacheFromStorage();
      const storageEntry = storageCache[key];
      if (storageEntry) {
        memoryCache.set(key, storageEntry); // Hydrate memory cache
        const isFresh = Date.now() - storageEntry.ts < expireMs;
        if (!isFresh) {
          // Revalidate in background
          void fetcher(key).then((newData) => set(key, newData));
        }
        return storageEntry.data;
      }
    } catch (err) {
      console.error(`[cache:${name}] Failed to get from storage:`, err);
    }

    // 3. All cache miss, fetch new data
    try {
      const newData = await fetcher(key);
      await set(key, newData);
      return newData;
    } catch (err) {
      console.error(`[cache:${name}] Failed to fetch new data:`, err);
      return null;
    }
  };

  const set = async (key: string, data: T): Promise<void> => {
    const entry = { data, ts: Date.now() };
    // 1. Update memory cache immediately
    memoryCache.set(key, entry);
    // 2. Queue write to persistent storage
    storageWritePromiseQueue = storageWritePromiseQueue.then(async () => {
      try {
        const cache = await getCacheFromStorage();
        cache[key] = entry;
        await setCacheToStorage(cache);
      } catch (err) {
        console.error(`[cache:${name}] Failed to set to storage:`, err);
      }
    });
    await storageWritePromiseQueue;
  };

  const clear = async (key?: string): Promise<void> => {
    // 1. Remove from memory cache
    if (key) {
      memoryCache.delete(key);
    } else {
      memoryCache.clear();
    }
    // 2. Queue removal from persistent storage
    storageWritePromiseQueue = storageWritePromiseQueue.then(async () => {
      try {
        if (!key) {
          await removeStorageKey(name);
        } else {
          const cache = await getCacheFromStorage();
          if (cache[key]) {
            delete cache[key];
            await setCacheToStorage(cache);
          }
        }
      } catch (err) {
        console.error(`[cache:${name}] Failed to clear from storage:`, err);
      }
    });
    await storageWritePromiseQueue;
  };

  const purgeStale = async (): Promise<void> => {
    const now = Date.now();
    // 1. Purge memory cache
    for (const [key, entry] of memoryCache.entries()) {
      if (now - entry.ts > expireMs) {
        memoryCache.delete(key);
      }
    }
    // 2. Purge persistent storage
    storageWritePromiseQueue = storageWritePromiseQueue.then(async () => {
      try {
        const storageCache = await getCacheFromStorage();
        const newCache: CacheStorage<T> = {};
        let changed = false;
        for (const key in storageCache) {
          if (Object.prototype.hasOwnProperty.call(storageCache, key)) {
            if (now - storageCache[key].ts <= expireMs) {
              newCache[key] = storageCache[key];
            } else {
              changed = true;
            }
          }
        }
        if (changed) {
          await setCacheToStorage(newCache);
        }
      } catch (err) {
        console.error(
          `[cache:${name}] Failed to purge stale from storage:`,
          err,
        );
      }
    });
    await storageWritePromiseQueue;
  };

  return { get, set, clear, purgeStale };
}
