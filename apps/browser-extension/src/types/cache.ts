export interface BadgeCacheEntry {
  count: number;
  isExisted: boolean;
  ts: number;
}

export type BadgeCacheStorage = Record<string, BadgeCacheEntry>;
