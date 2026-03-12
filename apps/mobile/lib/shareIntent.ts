/**
 * Platform abstraction for share intent handling.
 *
 * - Android: Uses our custom KarakeepShareIntentModule native module with
 *   a zustand store so all consumers share the same state.
 * - iOS: Uses expo-share-intent via ShareIntentProvider context
 *
 * This abstraction exists because expo-share-intent has reliability issues
 * on Android (cold start race conditions, intent overwrite bugs), but works
 * well on iOS where the Share Extension mechanism is complex to reimplement.
 */
import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useShareIntentContext } from "expo-share-intent";
import { create } from "zustand";

import KarakeepShareIntentModule from "../modules/android-share-intent";
import type { NativeShareIntentData } from "../modules/android-share-intent";

export interface ShareIntentFile {
  path: string;
  mimeType: string;
  fileName: string | null;
}

export interface ShareIntentData {
  text: string | null;
  webUrl: string | null;
  files: ShareIntentFile[] | null;
}

const EMPTY_SHARE_INTENT: ShareIntentData = {
  text: null,
  webUrl: null,
  files: null,
};

function hasData(data: ShareIntentData): boolean {
  return !!(data.text || data.webUrl || (data.files && data.files.length > 0));
}

/**
 * Parses the raw text from the native module to separate URLs from plain text.
 * Android shares URLs as plain text via EXTRA_TEXT, so we need to detect URLs
 * and route them to the webUrl field.
 */
function parseNativeData(data: NativeShareIntentData): ShareIntentData {
  if (data.type === "file" && data.files) {
    return {
      text: null,
      webUrl: null,
      files: data.files.map((f) => ({
        path: f.path,
        mimeType: f.mimeType,
        fileName: f.fileName,
      })),
    };
  }

  if (data.type === "text" && data.text) {
    // Check if the shared text is a URL
    try {
      const url = new URL(data.text);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return {
          text: null,
          webUrl: data.text,
          files: null,
        };
      }
    } catch {
      // Not a URL, treat as plain text
    }

    return {
      text: data.text,
      webUrl: null,
      files: null,
    };
  }

  return EMPTY_SHARE_INTENT;
}

// ============================================================================
// Android implementation - shared state via zustand
// ============================================================================

/**
 * Zustand store that holds the Android share intent state.
 * This ensures all consumers of useAndroidShareIntent() see the same data,
 * solving the problem where the first consumer would consume the native
 * singleton and the second consumer would get nothing.
 */
interface AndroidShareIntentStore {
  shareIntent: ShareIntentData;
  initialized: boolean;
  setShareIntent: (data: ShareIntentData) => void;
  reset: () => void;
  markInitialized: () => void;
}

const useAndroidShareIntentStore = create<AndroidShareIntentStore>((set) => ({
  shareIntent: EMPTY_SHARE_INTENT,
  initialized: false,
  setShareIntent: (data) => set({ shareIntent: data }),
  reset: () => {
    KarakeepShareIntentModule?.clearShareIntent();
    set({ shareIntent: EMPTY_SHARE_INTENT });
  },
  markInitialized: () => set({ initialized: true }),
}));

function useAndroidShareIntent() {
  const { shareIntent, initialized, setShareIntent, reset, markInitialized } =
    useAndroidShareIntentStore();

  const resetShareIntent = useCallback(() => {
    reset();
  }, [reset]);

  // Set up native event listener and initial fetch -- only once globally
  useEffect(() => {
    if (!KarakeepShareIntentModule) {
      console.warn(
        "KarakeepShareIntentModule not available - share intents will not work on Android",
      );
      return;
    }

    // Listen for share intents from warm starts (onNewIntent).
    // This listener is shared: multiple hook instances all write to the same
    // zustand store, so it's fine if multiple subscriptions fire.
    const subscription = KarakeepShareIntentModule.addListener(
      "onChange",
      (event: { value: NativeShareIntentData }) => {
        const parsed = parseNativeData(event.value);
        if (hasData(parsed)) {
          setShareIntent(parsed);
        }
      },
    );

    // On mount, check for a share intent from cold start.
    // Only do this once (first hook instance to mount).
    if (!initialized) {
      markInitialized();
      KarakeepShareIntentModule.getShareIntent().then(
        (data: NativeShareIntentData | null) => {
          if (data) {
            const parsed = parseNativeData(data);
            if (hasData(parsed)) {
              setShareIntent(parsed);
            }
          }
        },
      );
    }

    return () => {
      subscription.remove();
    };
  }, [initialized, markInitialized, setShareIntent]);

  // Handle app returning from background
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        // Check if there's a new share intent (e.g. from onNewIntent while
        // the app was being brought to foreground)
        KarakeepShareIntentModule?.getShareIntent().then(
          (data: NativeShareIntentData | null) => {
            if (data) {
              const parsed = parseNativeData(data);
              if (hasData(parsed)) {
                setShareIntent(parsed);
              }
            }
          },
        );
      }
    });

    return () => {
      subscription.remove();
    };
  }, [setShareIntent]);

  return {
    hasShareIntent: hasData(shareIntent),
    shareIntent,
    resetShareIntent,
  };
}

// ============================================================================
// iOS implementation (delegates to expo-share-intent)
// ============================================================================

function useIosShareIntent() {
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();

  // Map expo-share-intent's data shape to our unified shape
  const mappedIntent: ShareIntentData = {
    text: shareIntent?.text ?? null,
    webUrl: shareIntent?.webUrl ?? null,
    files: shareIntent?.files
      ? shareIntent.files.map(
          (f: { path: string; mimeType: string; fileName?: string }) => ({
            path: f.path,
            mimeType: f.mimeType,
            fileName: f.fileName ?? null,
          }),
        )
      : null,
  };

  return {
    hasShareIntent,
    shareIntent: mappedIntent,
    resetShareIntent,
  };
}

// ============================================================================
// Unified hook - picks the right implementation per platform
// ============================================================================

/**
 * Hook that provides share intent data from the native platform.
 *
 * On Android, this uses our custom KarakeepShareIntentModule with a shared
 * zustand store, so all consumers see the same state.
 * On iOS, this delegates to expo-share-intent's context.
 *
 * IMPORTANT: On iOS, this must be used inside a ShareIntentProvider.
 *
 * @returns {object} - { hasShareIntent, shareIntent, resetShareIntent }
 */
export function useKarakeepShareIntent() {
  if (Platform.OS === "android") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAndroidShareIntent();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useIosShareIntent();
}
