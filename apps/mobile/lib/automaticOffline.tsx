import type { ReactNode } from "react";
import type { ZGetBookmarksRequest } from "@karakeep/shared/types/bookmarks";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Battery from "expo-battery";
import * as Network from "expo-network";
import { onlineManager } from "@tanstack/react-query";

import { useTRPCClient } from "@karakeep/shared-react/trpc";

import {
  getOfflineLibraryScope,
  OFFLINE_LIBRARY_SCHEMA_VERSION,
  pruneAutomaticOfflineArticles,
  saveOfflineArticle,
} from "./offlineLibrary";
import type { OfflineSyncProgress } from "./offlineSync";
import { syncOfflineArticles } from "./offlineSync";
import useAppSettings, { useSettings } from "./settings";
import { useConnectionStatus } from "./useConnectionStatus";
import type { DownloadConditions } from "./offlineDownloadConditions";
import {
  downloadBlockedReason,
  watchDownloadConditions,
} from "./offlineDownloadConditions";

function isWifi(state: Network.NetworkState): boolean | null {
  if (!state.type || state.type === Network.NetworkStateType.UNKNOWN)
    return null;
  return (
    state.type === Network.NetworkStateType.WIFI && state.isConnected === true
  );
}
function isCharging(state: Battery.BatteryState): boolean | null {
  if (state === Battery.BatteryState.UNKNOWN) return null;
  return (
    state === Battery.BatteryState.CHARGING ||
    state === Battery.BatteryState.FULL ||
    state === Battery.BatteryState.NOT_CHARGING
  );
}

const SYNC_INTERVAL = 15 * 60_000;
interface SyncState extends OfflineSyncProgress {
  running: boolean;
  message?: string;
}
const initialState: SyncState = {
  running: false,
  completed: 0,
  total: 0,
  failed: 0,
};
const AutomaticOfflineContext = createContext<{
  state: SyncState;
  blockedReason?: string;
  refresh: () => void;
  cancel: () => void;
} | null>(null);

export function AutomaticOfflineProvider({
  children,
}: {
  children: ReactNode;
}) {
  const client = useTRPCClient();
  const { settings } = useAppSettings();
  const connection = useConnectionStatus();
  const scope = getOfflineLibraryScope(settings);
  const [state, setState] = useState(initialState);
  const [conditions, setConditions] = useState<DownloadConditions>({
    wifi: null,
    charging: null,
  });
  const currentConditions = useRef(conditions);
  const refreshConditions = useRef<(() => void) | null>(null);
  const blockedReason = downloadBlockedReason(settings, conditions);
  const enabled = settings.automaticOfflineCount > 0;
  const activeRun = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  const run = useRef<((force?: boolean) => void) | null>(null);

  const cancel = (allowRetry = false) => {
    if (!activeRun.current) return;
    if (allowRetry) lastAttempt.current = 0;
    activeRun.current.abort();
    activeRun.current = null;
    setState((previous) => ({
      ...previous,
      running: false,
      message: "Download stopped. Saved copies were kept.",
    }));
  };
  run.current = (force = false) => {
    if (
      activeRun.current ||
      !settings.apiKey ||
      settings.automaticOfflineCount === 0 ||
      connection !== "online" ||
      AppState.currentState !== "active" ||
      !!downloadBlockedReason(settings, currentConditions.current) ||
      (!force && Date.now() - lastAttempt.current < SYNC_INTERVAL)
    )
      return;
    const controller = new AbortController();
    activeRun.current = controller;
    lastAttempt.current = Date.now();
    setState({ ...initialState, running: true });
    const checkCurrentSettings = () => {
      const current = useSettings.getState().settings.settings;
      if (
        getOfflineLibraryScope(current) !== scope ||
        current.apiKey !== settings.apiKey ||
        current.automaticOfflineCount !== settings.automaticOfflineCount ||
        current.automaticOfflineExcludeArchived !==
          settings.automaticOfflineExcludeArchived ||
        current.automaticOfflineWifiOnly !==
          settings.automaticOfflineWifiOnly ||
        current.automaticOfflineChargingOnly !==
          settings.automaticOfflineChargingOnly ||
        !!downloadBlockedReason(current, currentConditions.current) ||
        !onlineManager.isOnline() ||
        AppState.currentState !== "active"
      )
        controller.abort();
      if (controller.signal.aborted) throw new Error("Download cancelled.");
    };
    void syncOfflineArticles({
      count: settings.automaticOfflineCount,
      excludeArchived: settings.automaticOfflineExcludeArchived,
      signal: controller.signal,
      list: (cursor: ZGetBookmarksRequest["cursor"]) => {
        checkCurrentSettings();
        return client.bookmarks.getBookmarks.query(
          {
            cursor,
            limit: 100,
            sortOrder: "desc",
            includeContent: false,
            useCursorV2: true,
            ...(settings.automaticOfflineExcludeArchived
              ? { archived: false }
              : {}),
          },
          { signal: controller.signal },
        );
      },
      download: (bookmarkId) => {
        checkCurrentSettings();
        return client.bookmarks.getBookmark.query(
          { bookmarkId, includeContent: true },
          { signal: controller.signal },
        );
      },
      save: (bookmark) => {
        checkCurrentSettings();
        saveOfflineArticle(
          scope,
          {
            schemaVersion: OFFLINE_LIBRARY_SCHEMA_VERSION,
            bookmarkId: bookmark.id,
            savedAt: Date.now(),
            bookmark,
          },
          true,
        );
      },
      prune: (keep) => {
        checkCurrentSettings();
        pruneAutomaticOfflineArticles(scope, keep);
      },
      onProgress: (progress) => {
        if (!controller.signal.aborted)
          setState({ ...progress, running: true });
      },
    })
      .then((progress) => {
        if (activeRun.current === controller && !controller.signal.aborted) {
          if (progress.failed > 0 || progress.incomplete)
            lastAttempt.current = 0;
          setState({
            ...progress,
            running: false,
            message:
              progress.failed > 0
                ? `${progress.failed} articles could not be downloaded. Existing copies were kept.`
                : progress.incomplete
                  ? `${progress.total} articles processed. The scan was incomplete; existing copies were kept.`
                  : `${progress.total} recent articles available offline.`,
          });
        }
      })
      .catch((error: unknown) => {
        if (activeRun.current !== controller) return;
        lastAttempt.current = 0;
        setState((previous) => ({
          ...previous,
          running: false,
          message: controller.signal.aborted
            ? "Download stopped. Saved copies were kept."
            : error instanceof Error
              ? error.message
              : "Could not download recent articles.",
        }));
      })
      .finally(() => {
        if (activeRun.current === controller) activeRun.current = null;
      });
  };

  useEffect(() => {
    lastAttempt.current = 0;
    setState(initialState);
    return () => cancel();
  }, [
    scope,
    settings.apiKey,
    settings.automaticOfflineCount,
    settings.automaticOfflineExcludeArchived,
    settings.automaticOfflineWifiOnly,
    settings.automaticOfflineChargingOnly,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const monitor = watchDownloadConditions(
      {
        wifi: {
          read: async () => isWifi(await Network.getNetworkStateAsync()),
          subscribe: (listener) => {
            const subscription = Network.addNetworkStateListener((value) =>
              listener(isWifi(value)),
            );
            return () => subscription.remove();
          },
        },
        charging: {
          read: async () => isCharging(await Battery.getBatteryStateAsync()),
          subscribe: (listener) => {
            const subscription = Battery.addBatteryStateListener(
              ({ batteryState }) => listener(isCharging(batteryState)),
            );
            return () => subscription.remove();
          },
        },
      },
      (next) => {
        currentConditions.current = next;
        setConditions(next);
        const current = useSettings.getState().settings.settings;
        if (downloadBlockedReason(current, next)) {
          if (activeRun.current) {
            cancel(true);
          }
        } else run.current?.();
      },
    );
    refreshConditions.current = monitor.refresh;
    return () => {
      refreshConditions.current = null;
      monitor.dispose();
      currentConditions.current = { wifi: null, charging: null };
    };
  }, [enabled]);

  useEffect(() => {
    if (
      connection !== "online" ||
      downloadBlockedReason(settings, currentConditions.current)
    )
      cancel(true);
    else run.current?.();
  }, [
    connection,
    scope,
    settings.apiKey,
    settings.automaticOfflineCount,
    settings.automaticOfflineExcludeArchived,
    settings.automaticOfflineWifiOnly,
    settings.automaticOfflineChargingOnly,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refreshConditions.current?.();
        run.current?.();
      } else cancel(true);
    });
    const interval = setInterval(() => run.current?.(), SYNC_INTERVAL);
    return () => {
      subscription.remove();
      clearInterval(interval);
      cancel();
    };
  }, []);

  return (
    <AutomaticOfflineContext.Provider
      value={{
        state,
        blockedReason,
        refresh: () => run.current?.(true),
        cancel: () => cancel(),
      }}
    >
      {children}
    </AutomaticOfflineContext.Provider>
  );
}

export function useAutomaticOffline() {
  const context = useContext(AutomaticOfflineContext);
  if (!context)
    throw new Error("Automatic offline downloads require a provider.");
  return context;
}
