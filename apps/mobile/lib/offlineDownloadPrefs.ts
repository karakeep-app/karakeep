import { useMemo } from "react";
import { createMMKV, useMMKVString } from "react-native-mmkv";
import { z } from "zod";

export const RECENT_LIMIT_OPTIONS = [50, 100, 200, 500] as const;
export const BUDGET_MB_OPTIONS = [100, 250, 500, 1024, 2048] as const;

const zOfflineDownloadPrefs = z.object({
  recentEnabled: z.boolean().default(false),
  recentLimit: z.number().int().positive().default(200),
  listIds: z.array(z.string()).default([]),
  budgetMb: z.number().positive().default(500),
  wifiOnly: z.boolean().default(true),
  // Articles the user removed by hand. Automatic downloads must not bring them
  // back; saving one manually lifts the exclusion.
  excludedIds: z.array(z.string()).default([]),
});

export type OfflineDownloadPrefs = z.infer<typeof zOfflineDownloadPrefs>;

// Download prefs and status live apart from the library so that wiping the
// articles never loses the user's choices (and vice versa).
export const offlineDownloadStorage = createMMKV({
  id: "karakeep-offline-downloads",
});

function prefsKey(scope: string) {
  return `prefs:${encodeURIComponent(scope)}`;
}

export function parseOfflineDownloadPrefs(
  raw: string | undefined,
): OfflineDownloadPrefs {
  let value: unknown = {};
  if (raw) {
    try {
      value = JSON.parse(raw);
    } catch {
      value = {};
    }
  }
  const result = zOfflineDownloadPrefs.safeParse(value);
  return result.success ? result.data : zOfflineDownloadPrefs.parse({});
}

export function getOfflineDownloadPrefs(scope: string) {
  return parseOfflineDownloadPrefs(
    offlineDownloadStorage.getString(prefsKey(scope)),
  );
}

export function updateOfflineDownloadPrefs(
  scope: string,
  update: (current: OfflineDownloadPrefs) => OfflineDownloadPrefs,
) {
  offlineDownloadStorage.set(
    prefsKey(scope),
    JSON.stringify(update(getOfflineDownloadPrefs(scope))),
  );
}

export function isAutoDownloadEnabled(prefs: OfflineDownloadPrefs) {
  return prefs.recentEnabled || prefs.listIds.length > 0;
}

export function setListKeptOffline(
  scope: string,
  listId: string,
  keep: boolean,
) {
  updateOfflineDownloadPrefs(scope, (prefs) => ({
    ...prefs,
    listIds: keep
      ? [...new Set([...prefs.listIds, listId])]
      : prefs.listIds.filter((id) => id !== listId),
  }));
}

export function excludeFromOfflineDownloads(scope: string, bookmarkId: string) {
  updateOfflineDownloadPrefs(scope, (prefs) =>
    prefs.excludedIds.includes(bookmarkId)
      ? prefs
      : { ...prefs, excludedIds: [...prefs.excludedIds, bookmarkId] },
  );
}

export function includeInOfflineDownloads(scope: string, bookmarkId: string) {
  const prefs = getOfflineDownloadPrefs(scope);
  if (prefs.excludedIds.includes(bookmarkId)) {
    updateOfflineDownloadPrefs(scope, (current) => ({
      ...current,
      excludedIds: current.excludedIds.filter((id) => id !== bookmarkId),
    }));
  }
}

// Mirrors clearOfflineLibrary: logging out forgets every account's downloads.
export function clearOfflineDownloadStorage() {
  offlineDownloadStorage.clearAll();
}

// Everything except exclusions: those only ever shrink the selection, and the
// download pass itself rewrites them.
function selectionSignature(prefs: OfflineDownloadPrefs) {
  return JSON.stringify([
    prefs.recentEnabled,
    prefs.recentLimit,
    prefs.listIds,
    prefs.budgetMb,
    prefs.wifiOnly,
  ]);
}

/** Calls `onChange` when a change affects what should be downloaded, or how. */
export function subscribeToOfflineDownloadPrefs(
  scope: string,
  onChange: (prefs: OfflineDownloadPrefs) => void,
) {
  const key = prefsKey(scope);
  let signature = selectionSignature(getOfflineDownloadPrefs(scope));
  const listener = offlineDownloadStorage.addOnValueChangedListener(
    (changedKey) => {
      if (changedKey !== key) {
        return;
      }
      const prefs = getOfflineDownloadPrefs(scope);
      const next = selectionSignature(prefs);
      if (next !== signature) {
        signature = next;
        onChange(prefs);
      }
    },
  );
  return () => listener.remove();
}

export function useOfflineDownloadPrefs(scope: string) {
  const [raw] = useMMKVString(prefsKey(scope), offlineDownloadStorage);
  return useMemo(() => parseOfflineDownloadPrefs(raw), [raw]);
}
