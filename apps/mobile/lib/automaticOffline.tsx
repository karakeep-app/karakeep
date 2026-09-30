import type { ReactNode } from "react";
import type { ZGetBookmarksRequest } from "@karakeep/shared/types/bookmarks";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
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
  const activeRun = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  const run = useRef<((force?: boolean) => void) | null>(null);

  const cancel = () => {
    if (!activeRun.current) return;
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
        !onlineManager.isOnline() ||
        AppState.currentState !== "active"
      )
        controller.abort();
      if (controller.signal.aborted) throw new Error("Download cancelled.");
    };
    void syncOfflineArticles({
      count: settings.automaticOfflineCount,
      signal: controller.signal,
      list: (cursor: ZGetBookmarksRequest["cursor"]) =>
        client.bookmarks.getBookmarks.query(
          {
            cursor,
            limit: 100,
            sortOrder: "desc",
            includeContent: false,
            useCursorV2: true,
          },
          { signal: controller.signal },
        ),
      download: (bookmarkId) =>
        client.bookmarks.getBookmark.query(
          { bookmarkId, includeContent: true },
          { signal: controller.signal },
        ),
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
        if (activeRun.current === controller && !controller.signal.aborted)
          setState({
            ...progress,
            running: false,
            message:
              progress.failed > 0
                ? `${progress.failed} articles could not be downloaded. Existing copies were kept.`
                : `${progress.total} recent articles available offline.`,
          });
      })
      .catch((error: unknown) => {
        if (activeRun.current !== controller) return;
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
    return cancel;
  }, [scope, settings.apiKey, settings.automaticOfflineCount]);

  useEffect(() => {
    if (connection !== "online") cancel();
    else run.current?.();
  }, [connection, scope, settings.apiKey, settings.automaticOfflineCount]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") run.current?.();
      else cancel();
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
      value={{ state, refresh: () => run.current?.(true), cancel }}
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
