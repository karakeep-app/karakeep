import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillCrawling } from "@karakeep/shared/utils/bookmarkUtils";

import type { OfflineLibraryItem } from "./offlineLibrary";

export interface SyncCandidate {
  bookmarkId: string;
  // False while the server has not produced reader content yet.
  ready: boolean;
}

export type StoredCopy = Pick<
  OfflineLibraryItem,
  "bookmarkId" | "source" | "byteSize" | "savedAt"
>;

export interface PreparedCopy {
  byteSize: number;
  save: () => void;
}

export interface SyncProgress {
  total: number;
  ready: number;
  failed: number;
  budgetReached: boolean;
}

// Thrown when the pass must stop as a whole (cancelled, offline…), as opposed
// to a single article failing.
export class SyncInterrupted extends Error {
  constructor(readonly reason: "cancelled" | "offline" | "wifi") {
    super(`Offline downloads interrupted: ${reason}`);
  }
}

// Thrown by `prepare` when the server has no reader content for the bookmark
// (a crawl can succeed, or fail, without any).
export class ContentUnavailable extends Error {}

export interface SyncDeps {
  budgetBytes: number;
  listStored: () => StoredCopy[];
  prepare: (candidate: SyncCandidate) => Promise<PreparedCopy>;
  remove: (bookmarkId: string) => void;
  // Exclusions made while the pass runs; the candidates predate them.
  isExcluded: (bookmarkId: string) => boolean;
  // Throws SyncInterrupted when the pass has to stop.
  checkpoint: () => Promise<void>;
  // Sizes learnt on earlier passes, keyed by bookmark. Lets a pass skip an
  // article it already knows can't fit instead of downloading it again just
  // to find out.
  knownSizes: Map<string, number>;
  onProgress?: (progress: SyncProgress) => void;
}

function toSyncCandidate(bookmark: ZBookmark): SyncCandidate | undefined {
  const { type } = bookmark.content;
  if (type !== BookmarkTypes.LINK && type !== BookmarkTypes.TEXT) {
    return undefined;
  }
  // A failed crawl may have left an earlier crawl's content, so it's tried
  // like any other.
  return { bookmarkId: bookmark.id, ready: !isBookmarkStillCrawling(bookmark) };
}

/** Whether the bookmark is an article or note, not an attachment or a failed crawl. */
export function isDownloadable(bookmark: ZBookmark) {
  return (
    toSyncCandidate(bookmark) !== undefined &&
    !(
      bookmark.content.type === BookmarkTypes.LINK &&
      bookmark.content.crawlStatus === "failure"
    )
  );
}

function newestFirst(left: ZBookmark, right: ZBookmark) {
  return right.createdAt.getTime() - left.createdAt.getTime();
}

/**
 * Orders what should be kept offline, most important first: everything in the
 * kept lists, then the recent articles. Position is priority when the budget
 * runs out.
 */
export function selectCandidates(
  listBookmarks: ZBookmark[],
  recentBookmarks: ZBookmark[],
  excludedIds: readonly string[],
): SyncCandidate[] {
  const excluded = new Set(excludedIds);
  const seen = new Set<string>();
  const candidates: SyncCandidate[] = [];
  for (const bookmark of [
    ...[...listBookmarks].sort(newestFirst),
    ...[...recentBookmarks].sort(newestFirst),
  ]) {
    if (seen.has(bookmark.id) || excluded.has(bookmark.id)) {
      continue;
    }
    seen.add(bookmark.id);
    const candidate = toSyncCandidate(bookmark);
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function totalSize(copies: StoredCopy[]) {
  return copies.reduce((sum, copy) => sum + (copy.byteSize ?? 0), 0);
}

/**
 * Automatic copies ranked below `rank`, least important first. Copies nobody
 * wants any more go first, oldest of them first.
 */
function evictionOrder(
  stored: StoredCopy[],
  priority: (bookmarkId: string) => number,
  rank: number,
) {
  return stored
    .filter(
      (copy) => copy.source === "auto" && priority(copy.bookmarkId) > rank,
    )
    .sort(
      (left, right) =>
        priority(right.bookmarkId) - priority(left.bookmarkId) ||
        left.savedAt - right.savedAt,
    );
}

/**
 * The copies to evict so that `incoming` fits, or undefined if it can't fit
 * even then. Never partial: nothing is worth evicting for an article that
 * will not be saved anyway.
 */
export function planRoomFor(
  incoming: { bookmarkId: string; byteSize: number; rank: number },
  stored: StoredCopy[],
  priority: (bookmarkId: string) => number,
  budgetBytes: number,
): string[] | undefined {
  let used = totalSize(stored) + incoming.byteSize;
  const evictions: string[] = [];
  for (const copy of evictionOrder(stored, priority, incoming.rank)) {
    if (used <= budgetBytes) {
      break;
    }
    evictions.push(copy.bookmarkId);
    used -= copy.byteSize ?? 0;
  }
  return used <= budgetBytes ? evictions : undefined;
}

/**
 * Brings the stored automatic copies in line with `candidates` within the
 * budget: downloads the ones that are missing and removes the ones no longer
 * wanted. Copies are downloaded once and not refreshed. Manual copies are
 * never touched. A download is saved before anything is evicted for it, so a
 * failure never loses what was there.
 */
export async function synchronizeOfflineCopies(
  candidates: SyncCandidate[],
  deps: SyncDeps,
): Promise<SyncProgress> {
  const ranks = new Map(
    candidates.map((candidate, index) => [candidate.bookmarkId, index]),
  );
  const priority = (bookmarkId: string) =>
    ranks.get(bookmarkId) ?? Number.POSITIVE_INFINITY;
  let failed = 0;
  let budgetReached = false;
  // Articles the server had no reader content for (see ContentUnavailable).
  // They don't count as failed, and are tried again on the next pass.
  const unavailable = new Set<string>();

  const progress = (): SyncProgress => {
    const stored = new Map(
      deps.listStored().map((copy) => [copy.bookmarkId, copy]),
    );
    let total = 0;
    let ready = 0;
    for (const { bookmarkId } of candidates) {
      if (stored.has(bookmarkId)) {
        ready += 1;
      } else if (unavailable.has(bookmarkId)) {
        // Nothing that could be downloaded, so nothing to wait for either.
        continue;
      }
      total += 1;
    }
    return { total, ready, failed, budgetReached };
  };
  const report = () => deps.onProgress?.(progress());
  const fail = () => {
    failed += 1;
    report();
  };

  // A pass that should already have stopped must not touch anything.
  await deps.checkpoint();

  // The budget may have been lowered since the last pass.
  let used = totalSize(deps.listStored());
  for (const copy of evictionOrder(deps.listStored(), priority, -1)) {
    if (used <= deps.budgetBytes) {
      break;
    }
    deps.remove(copy.bookmarkId);
    used -= copy.byteSize ?? 0;
    // Spares downloading it again below just to find it still doesn't fit.
    if (copy.byteSize !== undefined) {
      deps.knownSizes.set(copy.bookmarkId, copy.byteSize);
    }
  }
  report();

  for (const [rank, candidate] of candidates.entries()) {
    const { bookmarkId } = candidate;
    if (
      deps.isExcluded(bookmarkId) ||
      deps.listStored().some((copy) => copy.bookmarkId === bookmarkId)
    ) {
      continue;
    }
    if (!candidate.ready) {
      fail();
      continue;
    }

    const knownSize = deps.knownSizes.get(bookmarkId);
    if (
      knownSize !== undefined &&
      !planRoomFor(
        { bookmarkId, byteSize: knownSize, rank },
        deps.listStored(),
        priority,
        deps.budgetBytes,
      )
    ) {
      budgetReached = true;
      break;
    }

    // Only before network work: skipping stored copies needs no checks.
    await deps.checkpoint();
    let prepared: PreparedCopy;
    try {
      prepared = await deps.prepare(candidate);
    } catch (error) {
      if (error instanceof SyncInterrupted) {
        throw error;
      }
      if (error instanceof ContentUnavailable) {
        unavailable.add(bookmarkId);
        report();
        continue;
      }
      // A download that died because the connection went away is not the
      // article's fault; let the checkpoint stop the pass instead.
      await deps.checkpoint();
      fail();
      continue;
    }
    deps.knownSizes.set(bookmarkId, prepared.byteSize);

    // The user may have saved or removed it by hand while it downloaded.
    const stored = deps.listStored();
    if (
      deps.isExcluded(bookmarkId) ||
      stored.some((copy) => copy.bookmarkId === bookmarkId)
    ) {
      continue;
    }
    const evictions = planRoomFor(
      { bookmarkId, byteSize: prepared.byteSize, rank },
      stored,
      priority,
      deps.budgetBytes,
    );
    if (!evictions) {
      budgetReached = true;
      break;
    }
    try {
      prepared.save();
    } catch {
      fail();
      continue;
    }
    for (const bookmarkId of evictions) {
      deps.remove(bookmarkId);
    }
    report();
  }

  // Copies that fell out of the selection. While some articles failed, keep as
  // many of the old ones as are missing so a flaky pass doesn't shrink the
  // library, without letting one broken article block cleanup for good.
  const unwanted = deps
    .listStored()
    .filter((copy) => copy.source === "auto" && !ranks.has(copy.bookmarkId))
    .sort((left, right) => right.savedAt - left.savedAt);
  for (const copy of unwanted.slice(failed)) {
    deps.remove(copy.bookmarkId);
  }

  const result = progress();
  deps.onProgress?.(result);
  return result;
}
