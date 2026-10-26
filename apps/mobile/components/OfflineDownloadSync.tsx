import type { AppStateStatus } from "react-native";
import { useEffect } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import { subscribeToOfflineDownloadPrefs } from "@/lib/offlineDownloadPrefs";
import {
  getOfflineLibraryScope,
  reconcileOfflineLibrary,
} from "@/lib/offlineLibrary";
import {
  cancelOfflineDownloads,
  refreshOfflineDownloads,
} from "@/lib/offlineSync";
import useAppSettings from "@/lib/settings";

// Settle time after a burst of changes (toggling several lists, flaky
// connectivity) before starting a pass.
const CHANGE_DEBOUNCE = 1_500;
// Much shorter than the refresh throttle, which skips the ticks inside it, so
// a pass starts soon after one is due rather than up to a throttle late.
const TICK_INTERVAL = 60_000;

function isActive(state: AppStateStatus = AppState.currentState) {
  return state === "active";
}

/**
 * Keeps automatic offline downloads going while the app is open: on launch,
 * on return to the foreground, periodically, and shortly after a download
 * settings or connectivity change.
 */
export function OfflineDownloadSync() {
  const { settings } = useAppSettings();
  const isLoggedIn = !!settings.apiKey;
  const scope = getOfflineLibraryScope(settings);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    reconcileOfflineLibrary(scope);

    let pending: ReturnType<typeof setTimeout> | undefined;
    // A change that came due in the background, to act on once back.
    let changedInBackground = false;
    const refreshSoon = () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (isActive()) {
          void refreshOfflineDownloads({ force: true });
        } else {
          changedInBackground = true;
        }
      }, CHANGE_DEBOUNCE);
    };
    const refreshIfDue = () => {
      if (isActive()) {
        void refreshOfflineDownloads({ force: changedInBackground });
        changedInBackground = false;
      }
    };
    refreshIfDue();

    const interval = setInterval(refreshIfDue, TICK_INTERVAL);
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (isActive(state)) {
          refreshIfDue();
        } else if (state === "background") {
          cancelOfflineDownloads();
        }
      },
    );
    // Restart rather than continue: a pass that started on Wi-Fi must not
    // carry on over cellular. Only for changes that matter to a pass; Android
    // also reports capability changes that leave all of these as they were.
    let network: string | undefined;
    const networkSubscription = Network.addNetworkStateListener((state) => {
      const next = `${state.isConnected}|${state.type}`;
      if (next === network) {
        return;
      }
      network = next;
      cancelOfflineDownloads();
      refreshSoon();
    });
    const unsubscribePrefs = subscribeToOfflineDownloadPrefs(scope, () => {
      cancelOfflineDownloads();
      refreshSoon();
    });

    return () => {
      clearTimeout(pending);
      clearInterval(interval);
      appStateSubscription.remove();
      networkSubscription.remove();
      unsubscribePrefs();
    };
  }, [isLoggedIn, scope]);

  return null;
}
