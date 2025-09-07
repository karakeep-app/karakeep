import { ZBookmark } from "@karakeep/shared/types/bookmarks.ts";

export interface BadgeCacheEntry {
  count: number;
  exactMatch: ZBookmark | null;
  ts: number;
}

export type BadgeCacheStorage = Record<string, BadgeCacheEntry>;
