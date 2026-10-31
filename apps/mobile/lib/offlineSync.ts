import { useSyncExternalStore } from "react";
import * as Network from "expo-network";
import { z } from "zod";

import type {
  ZBookmark,
  ZGetBookmarksResponse,
} from "@karakeep/shared/types/bookmarks";
import { getTRPCClient } from "@karakeep/shared-react/providers/trpc-provider";
import {
  BookmarkTypes,
  MAX_NUM_BOOKMARKS_PER_PAGE,
} from "@karakeep/shared/types/bookmarks";

import type { OfflineDownloadPrefs } from "./offlineDownloadPrefs";
import type { Settings } from "./settings";
import type { SyncCandidate, SyncProgress } from "./offlineSyncEngine";
import {
  getOfflineDownloadPrefs,
  isAutoDownloadEnabled,
  offlineDownloadStorage,
  updateOfflineDownloadPrefs,
} from "./offlineDownloadPrefs";
import { inlineBookmarkImages } from "./offlineImages";
import {
  estimateOfflineArticleSize,
  getOfflineLibraryItems,
  getOfflineLibraryScope,
  OFFLINE_LIBRARY_SCHEMA_VERSION,
  removeOfflineArticle,
  saveOfflineArticle,
} from "./offlineLibrary";
import {
  ContentUnavailable,
  isDownloadable,
  selectCandidates,
  synchronizeOfflineCopies,
  SyncInterrupted,
} from "./offlineSyncEngine";
import { useSettings } from "./settings";
import { megabytesToBytes } from "./storageSize";

// Foreground triggers (app open, timer) back off for this long after a pass.
export const REFRESH_THROTTLE = 5 * 60 * 1000;

const zPhase = z.enum([
  "idle",
  "checking",
  "downloading",
  "ready",
  "wifi",
  "offline",
  "paused",
  "error",
  "disabled",
]);
export type OfflineSyncPhase = z.infer<typeof zPhase>;

const zStatus = z.object({
  phase: zPhase,
  total: z.number(),
  ready: z.number(),
  failed: z.number(),
  budgetReached: z.boolean(),
  lastAttemptAt: z.number().optional(),
  lastCheckedAt: z.number().optional(),
});
export type OfflineSyncStatus = z.infer<typeof zStatus>;

const INITIAL_STATUS: OfflineSyncStatus = {
  phase: "idle",
  total: 0,
  ready: 0,
  failed: 0,
  budgetReached: false,
};

// A pass that ended in one of these didn't finish; retry without waiting out
// the throttle once conditions change.
const INTERRUPTED_PHASES = new Set<OfflineSyncPhase>([
  "paused",
  "wifi",
  "offline",
  "error",
]);

function statusKey(scope: string) {
  return `status:${encodeURIComponent(scope)}`;
}

let statusState: { scope: string; status: OfflineSyncStatus } | undefined;
const statusListeners = new Set<() => void>();

function loadStatus(scope: string): OfflineSyncStatus {
  const raw = offlineDownloadStorage.getString(statusKey(scope));
  if (!raw) {
    return INITIAL_STATUS;
  }
  try {
    const result = zStatus.safeParse(JSON.parse(raw));
    if (!result.success) {
      return INITIAL_STATUS;
    }
    // Persisted mid-pass: the app was killed or suspended before it finished.
    return result.data.phase === "checking" ||
      result.data.phase === "downloading"
      ? { ...result.data, phase: "paused" }
      : result.data;
  } catch {
    return INITIAL_STATUS;
  }
}

function getOfflineSyncStatus(scope: string) {
  if (statusState?.scope !== scope) {
    statusState = { scope, status: loadStatus(scope) };
  }
  return statusState.status;
}

function updateStatus(scope: string, patch: Partial<OfflineSyncStatus>) {
  const status = { ...getOfflineSyncStatus(scope), ...patch };
  statusState = { scope, status };
  offlineDownloadStorage.set(statusKey(scope), JSON.stringify(status));
  for (const listener of statusListeners) {
    listener();
  }
}

function subscribeToStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function useOfflineSyncStatus(scope: string) {
  const getSnapshot = () => getOfflineSyncStatus(scope);
  return useSyncExternalStore(subscribeToStatus, getSnapshot, getSnapshot);
}

interface ActiveRun {
  controller: AbortController;
  // Set on logout: whatever the run was doing must not touch storage again.
  discarded: boolean;
}

let activeRun: ActiveRun | undefined;
let running: Promise<OfflineSyncStatus | undefined> | undefined;
let queuedRefresh: RefreshOptions | undefined;
// Sizes of articles seen on earlier passes (see SyncDeps.knownSizes).
const knownSizes = new Map<string, number>();

export interface RefreshOptions {
  // Skip the throttle ("Download now", settings changed…).
  force?: boolean;
}

type TRPCClient = ReturnType<typeof getTRPCClient>;

function currentSettings(): Settings {
  return useSettings.getState().settings.settings;
}

function errorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    typeof error.data.code === "string"
  ) {
    return error.data.code;
  }
  return undefined;
}

async function fetchBookmarks(
  client: TRPCClient,
  filter: { listId?: string; archived?: boolean },
  limit: number,
  signal: AbortSignal,
  checkpoint: () => Promise<void>,
  // Which bookmarks count towards the limit.
  counts: (bookmark: ZBookmark) => boolean = () => true,
) {
  const bookmarks: ZBookmark[] = [];
  let counted = 0;
  const seenCursors = new Set<string>();
  let cursor: ZGetBookmarksResponse["nextCursor"] = null;
  do {
    await checkpoint();
    const page = await client.bookmarks.getBookmarks.query(
      {
        ...filter,
        cursor,
        limit: Math.min(MAX_NUM_BOOKMARKS_PER_PAGE, limit - counted),
        sortOrder: "desc",
        includeContent: false,
        useCursorV2: true,
      },
      { signal },
    );
    bookmarks.push(...page.bookmarks);
    counted += page.bookmarks.filter(counts).length;
    cursor = page.nextCursor;
    if (cursor) {
      const cursorKey = `${cursor.createdAt.getTime()}|${cursor.id}`;
      if (seenCursors.has(cursorKey)) {
        throw new Error("The server returned a repeated page.");
      }
      seenCursors.add(cursorKey);
    }
  } while (cursor && counted < limit);
  return bookmarks;
}

async function fetchSelection(
  client: TRPCClient,
  prefs: OfflineDownloadPrefs,
  signal: AbortSignal,
  checkpoint: () => Promise<void>,
) {
  const listBookmarks: ZBookmark[] = [];
  const goneListIds: string[] = [];
  for (const listId of prefs.listIds) {
    try {
      listBookmarks.push(
        ...(await fetchBookmarks(
          client,
          { listId },
          Number.POSITIVE_INFINITY,
          signal,
          checkpoint,
        )),
      );
    } catch (error) {
      // The list was deleted or is no longer shared with us: nothing in it is
      // wanted any more. Anything else leaves the selection unknown.
      const code = errorCode(error);
      if (code !== "NOT_FOUND" && code !== "FORBIDDEN") {
        throw error;
      }
      goneListIds.push(listId);
    }
  }
  const excluded = new Set(prefs.excludedIds);
  const recentBookmarks = prefs.recentEnabled
    ? await fetchBookmarks(
        client,
        { archived: false },
        prefs.recentLimit,
        signal,
        checkpoint,
        // Only articles that will be downloaded use up the count: not
        // attachments, failed crawls or the ones the user removed.
        (bookmark) => isDownloadable(bookmark) && !excluded.has(bookmark.id),
      )
    : [];
  return {
    candidates: selectCandidates(
      listBookmarks,
      recentBookmarks,
      prefs.excludedIds,
    ),
    selectedIds: new Set(
      [...listBookmarks, ...recentBookmarks].map((bookmark) => bookmark.id),
    ),
    goneListIds,
  };
}

// An exclusion only matters while the article would otherwise be selected;
// dropping the rest keeps the list from growing forever.
function forgetStaleExclusions(scope: string, selectedIds: Set<string>) {
  if (
    getOfflineDownloadPrefs(scope).excludedIds.every((id) =>
      selectedIds.has(id),
    )
  ) {
    return;
  }
  updateOfflineDownloadPrefs(scope, (current) => ({
    ...current,
    excludedIds: current.excludedIds.filter((id) => selectedIds.has(id)),
  }));
}

// A list that is gone can't be picked in settings any more, so it would stay
// selected for good.
function forgetGoneLists(scope: string, goneListIds: string[]) {
  if (goneListIds.length === 0) {
    return;
  }
  updateOfflineDownloadPrefs(scope, (current) => ({
    ...current,
    listIds: current.listIds.filter((id) => !goneListIds.includes(id)),
  }));
}

// Ignores isInternetReachable, like setupOnlineManager: Android reports it as
// false behind VPNs and on LAN-only setups that reach the server just fine.
function isAllowedNetwork(state: Network.NetworkState, wifiOnly: boolean) {
  if (!state.isConnected) {
    return "offline";
  }
  if (
    wifiOnly &&
    state.type !== Network.NetworkStateType.WIFI &&
    state.type !== Network.NetworkStateType.ETHERNET
  ) {
    return "wifi";
  }
  return undefined;
}

function removeAutomaticCopies(scope: string) {
  for (const item of getOfflineLibraryItems(scope)) {
    if (item.source === "auto") {
      removeOfflineArticle(scope, item.bookmarkId);
    }
  }
}

async function runOnce(
  options: RefreshOptions,
): Promise<OfflineSyncStatus | undefined> {
  const settings = currentSettings();
  if (!settings.apiKey) {
    return undefined;
  }
  const scope = getOfflineLibraryScope(settings);
  const prefs = getOfflineDownloadPrefs(scope);
  const previous = getOfflineSyncStatus(scope);

  if (!isAutoDownloadEnabled(prefs)) {
    removeAutomaticCopies(scope);
    updateStatus(scope, { ...INITIAL_STATUS, phase: "disabled" });
    return getOfflineSyncStatus(scope);
  }
  if (
    !options.force &&
    previous.lastAttemptAt !== undefined &&
    Date.now() - previous.lastAttemptAt < REFRESH_THROTTLE &&
    !INTERRUPTED_PHASES.has(previous.phase)
  ) {
    return previous;
  }

  const run: ActiveRun = {
    controller: new AbortController(),
    discarded: false,
  };
  activeRun = run;
  const { signal } = run.controller;

  const checkpoint = async () => {
    if (signal.aborted) {
      throw new SyncInterrupted("cancelled");
    }
    const blocked = isAllowedNetwork(
      await Network.getNetworkStateAsync(),
      prefs.wifiOnly,
    );
    if (blocked) {
      throw new SyncInterrupted(blocked);
    }
  };

  updateStatus(scope, { phase: "checking", lastAttemptAt: Date.now() });
  try {
    await checkpoint();
    const client = getTRPCClient(settings);
    const { candidates, selectedIds, goneListIds } = await fetchSelection(
      client,
      prefs,
      signal,
      checkpoint,
    );
    if (run.discarded) {
      return undefined;
    }
    forgetStaleExclusions(scope, selectedIds);
    forgetGoneLists(scope, goneListIds);

    updateStatus(scope, { phase: "downloading", total: candidates.length });
    const result = await synchronizeOfflineCopies(candidates, {
      budgetBytes: megabytesToBytes(prefs.budgetMb),
      knownSizes,
      checkpoint,
      listStored: () => getOfflineLibraryItems(scope),
      isExcluded: (bookmarkId) =>
        getOfflineDownloadPrefs(scope).excludedIds.includes(bookmarkId),
      prepare: async (candidate: SyncCandidate) => {
        const fetched = await client.bookmarks.getBookmark.query(
          { bookmarkId: candidate.bookmarkId, includeContent: true },
          { signal },
        );
        if (
          fetched.content.type === BookmarkTypes.LINK &&
          typeof fetched.content.htmlContent !== "string"
        ) {
          throw new ContentUnavailable();
        }
        const bookmark = await inlineBookmarkImages(fetched, {
          signal,
        });
        return {
          byteSize: estimateOfflineArticleSize(bookmark),
          save: () => {
            if (run.discarded) {
              throw new SyncInterrupted("cancelled");
            }
            saveOfflineArticle(
              scope,
              {
                schemaVersion: OFFLINE_LIBRARY_SCHEMA_VERSION,
                bookmarkId: bookmark.id,
                savedAt: Date.now(),
                bookmark,
              },
              "auto",
            );
          },
        };
      },
      remove: (bookmarkId) => {
        if (!run.discarded) {
          removeOfflineArticle(scope, bookmarkId);
        }
      },
      onProgress: (progress: SyncProgress) => {
        if (!run.discarded) {
          updateStatus(scope, { ...progress, phase: "downloading" });
        }
      },
    });

    if (run.discarded) {
      return undefined;
    }
    updateStatus(scope, {
      ...result,
      phase: "ready",
      lastCheckedAt: Date.now(),
    });
  } catch (error) {
    if (run.discarded) {
      return undefined;
    }
    // An aborted request fails with its own error, not SyncInterrupted.
    if (error instanceof SyncInterrupted || signal.aborted) {
      const reason =
        error instanceof SyncInterrupted ? error.reason : undefined;
      updateStatus(scope, {
        phase: reason === "offline" || reason === "wifi" ? reason : "paused",
      });
    } else {
      updateStatus(scope, { phase: "error" });
    }
  } finally {
    if (activeRun === run) {
      activeRun = undefined;
    }
  }
  return getOfflineSyncStatus(scope);
}

/**
 * Runs a download pass for the signed-in account. Only one pass runs at a
 * time; a request made during a pass runs once it ends, throttled unless
 * forced. Even an unforced one has to wait its turn rather than be dropped:
 * the running pass may be for an account that was just signed out of.
 */
export function refreshOfflineDownloads(
  options: RefreshOptions = {},
): Promise<OfflineSyncStatus | undefined> {
  if (running) {
    if (!queuedRefresh?.force) {
      queuedRefresh = options;
    }
    return running;
  }
  const pass = (async () => {
    let status: OfflineSyncStatus | undefined;
    let next: RefreshOptions | undefined = options;
    try {
      while (next) {
        queuedRefresh = undefined;
        status = await runOnce(next);
        next = queuedRefresh;
      }
    } finally {
      running = undefined;
    }
    return status;
  })();
  running = pass;
  return pass;
}

export function cancelOfflineDownloads() {
  queuedRefresh = undefined;
  activeRun?.controller.abort();
}

// On logout: stop the current pass without letting it write anything, and
// forget everything held in memory.
export function resetOfflineDownloads() {
  queuedRefresh = undefined;
  if (activeRun) {
    activeRun.discarded = true;
    activeRun.controller.abort();
  }
  knownSizes.clear();
  statusState = undefined;
  for (const listener of statusListeners) {
    listener();
  }
}
