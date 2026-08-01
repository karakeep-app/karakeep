import { useState } from "react";
import { KeyboardAvoidingView, Pressable, View } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import BookmarkAssetView from "@/components/bookmarks/BookmarkAssetView";
import BookmarkLinkTypeSelector, {
  BookmarkLinkType,
} from "@/components/bookmarks/BookmarkLinkTypeSelector";
import BookmarkLinkView from "@/components/bookmarks/BookmarkLinkView";
import BookmarkTextView from "@/components/bookmarks/BookmarkTextView";
import BottomActions from "@/components/bookmarks/BottomActions";
import QueryPageState from "@/components/QueryPageState";
import { shouldUseGlassPill } from "@/lib/ios";
import {
  getOfflineLibraryScope,
  useOfflineArticle,
} from "@/lib/offlineLibrary";
import useAppSettings from "@/lib/settings";
import { useConnectionStatus } from "@/lib/useConnectionStatus";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getBookmarkRefreshInterval } from "@karakeep/shared/utils/bookmarkUtils";

function KeepScreenOn() {
  useKeepAwake();
  return null;
}

export default function BookmarkView() {
  const router = useRouter();
  const { slug } = useLocalSearchParams();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { settings } = useAppSettings();
  const connectionStatus = useConnectionStatus();
  const api = useTRPC();

  const [bookmarkLinkType, setBookmarkLinkType] = useState<BookmarkLinkType>(
    settings.defaultBookmarkView === "externalBrowser"
      ? "browser"
      : settings.defaultBookmarkView,
  );

  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const offlineArticle = useOfflineArticle(
    getOfflineLibraryScope(settings),
    slug,
  );

  const {
    data: bookmark,
    error,
    refetch,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId: slug,
        includeContent: false,
      },
      {
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) return false;
          return getBookmarkRefreshInterval(data);
        },
      },
    ),
  );
  const displayedBookmark = bookmark ?? offlineArticle?.bookmark;
  const isOffline =
    connectionStatus === "device-offline" ||
    connectionStatus === "server-unreachable";
  const displayedBookmarkLinkType: BookmarkLinkType =
    isOffline && offlineArticle ? "reader" : bookmarkLinkType;

  if (!displayedBookmark) {
    return <QueryPageState error={error} onRetry={refetch} />;
  }

  let comp;
  let title = null;
  switch (displayedBookmark.content.type) {
    case BookmarkTypes.LINK:
      title = displayedBookmark.title ?? displayedBookmark.content.title;
      comp = (
        <BookmarkLinkView
          bookmark={displayedBookmark}
          bookmarkPreviewType={displayedBookmarkLinkType}
        />
      );
      break;
    case BookmarkTypes.TEXT:
      title = displayedBookmark.title;
      comp = <BookmarkTextView bookmark={displayedBookmark} />;
      break;
    case BookmarkTypes.ASSET:
      title = displayedBookmark.title ?? displayedBookmark.content.fileName;
      comp = <BookmarkAssetView bookmark={displayedBookmark} />;
      break;
  }
  return (
    <KeyboardAvoidingView
      // BottomActions owns the safe-area inset. Adding it to this wrapper as
      // well leaves a visible gap below the toolbar on Android and legacy iOS.
      style={{ flex: 1 }}
      behavior="height"
    >
      {settings.keepScreenOnWhileReading && <KeepScreenOn />}
      <Stack.Screen
        options={{
          headerTitle: title ?? "",
          headerBackTitle: "Back",
          headerTransparent: false,
          headerShown: true,
          headerStyle: {
            backgroundColor: isDark ? "#000" : "#fff",
          },
          headerTintColor: isDark ? "#fff" : "#000",
          headerRight: () =>
            displayedBookmark.content.type === BookmarkTypes.LINK ? (
              <View
                className={`flex-row items-center gap-3${shouldUseGlassPill ? " px-2" : ""}`}
              >
                {displayedBookmarkLinkType === "reader" && (
                  <Pressable
                    onPress={() =>
                      router.push("/dashboard/settings/reader-settings")
                    }
                  >
                    <Settings size={20} color={isDark ? "#fff" : "#000"} />
                  </Pressable>
                )}
                <BookmarkLinkTypeSelector
                  type={displayedBookmarkLinkType}
                  onChange={(type) => setBookmarkLinkType(type)}
                  bookmark={displayedBookmark}
                />
              </View>
            ) : undefined,
        }}
      />
      {comp}
      {shouldUseGlassPill ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          <BottomActions bookmark={displayedBookmark} />
        </View>
      ) : (
        <BottomActions bookmark={displayedBookmark} />
      )}
    </KeyboardAvoidingView>
  );
}
