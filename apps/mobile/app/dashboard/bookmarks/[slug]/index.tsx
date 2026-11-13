import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useKeepAwake } from "expo-keep-awake";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import BookmarkAssetView from "@/components/bookmarks/BookmarkAssetView";
import BookmarkLinkTypeSelector, {
  BookmarkLinkType,
} from "@/components/bookmarks/BookmarkLinkTypeSelector";
import { ReaderChromeContext } from "@/components/bookmarks/BookmarkLinkPreview";
import BookmarkLinkView from "@/components/bookmarks/BookmarkLinkView";
import BookmarkTextView from "@/components/bookmarks/BookmarkTextView";
import BottomActions from "@/components/bookmarks/BottomActions";
import QueryPageState from "@/components/QueryPageState";
import { useTranslation } from "@/lib/i18n/hooks";
import { shouldUseGlassPill } from "@/lib/ios";
import {
  getOfflineLibraryScope,
  useOfflineArticle,
} from "@/lib/offlineLibrary";
import useAppSettings from "@/lib/settings";
import { useConnectionStatus } from "@/lib/useConnectionStatus";
import { useQuery } from "@tanstack/react-query";
import { ALargeSmall } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getBookmarkRefreshInterval } from "@karakeep/shared/utils/bookmarkUtils";

function SymbolOrAa({ color }: { color: string }) {
  return Platform.OS === "ios" ? (
    <SymbolView name="textformat.size" size={20} tintColor={color} />
  ) : (
    <ALargeSmall size={24} color={color} />
  );
}

function KeepScreenOn() {
  useKeepAwake();
  return null;
}

export default function BookmarkView() {
  const router = useRouter();
  const { slug, highlightId } = useLocalSearchParams();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { settings } = useAppSettings();
  const connectionStatus = useConnectionStatus();
  const { t } = useTranslation();
  const api = useTRPC();

  const [isChromeHidden, setIsChromeHidden] = useState(false);
  const toolbarStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isChromeHidden ? 0 : 1, { duration: 200 }),
    transform: [
      { translateY: withTiming(isChromeHidden ? 100 : 0, { duration: 200 }) },
    ],
  }));

  const [bookmarkLinkType, setBookmarkLinkType] = useState<BookmarkLinkType>(
    // A highlight can only be shown in the reader.
    highlightId
      ? "reader"
      : settings.defaultBookmarkView === "externalBrowser"
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
      // An untitled note's first line is right there in the body.
      title = displayedBookmark.title?.trim() || t("bookmarks.note_title");
      comp = <BookmarkTextView bookmark={displayedBookmark} />;
      break;
    case BookmarkTypes.ASSET:
      title = displayedBookmark.title ?? displayedBookmark.content.fileName;
      comp = <BookmarkAssetView bookmark={displayedBookmark} />;
      break;
  }
  // A live web page has its own fixed footers and banners, which a floating
  // toolbar would cover, so it gets its own space instead.
  const hostsThirdPartyPage =
    displayedBookmark.content.type === BookmarkTypes.LINK &&
    displayedBookmarkLinkType !== "reader";

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
          // The reader shows the title itself once the article's heading scrolls away.
          ...(displayedBookmark.content.type === BookmarkTypes.LINK &&
          displayedBookmarkLinkType === "reader"
            ? {}
            : { headerTitle: title ?? "" }),
          headerTransparent: false,
          headerShown: true,
          headerTintColor: isDark ? "#fff" : "#000",
          // Notes manage their own Edit/Save buttons.
          ...(displayedBookmark.content.type === BookmarkTypes.TEXT
            ? {}
            : {
                headerRight: () =>
                  displayedBookmark.content.type === BookmarkTypes.LINK ? (
                    <View
                      className={`flex-row items-center gap-3${shouldUseGlassPill ? " px-2" : ""}`}
                    >
                      {displayedBookmarkLinkType === "reader" && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("settings.reader_text_layout")}
                          hitSlop={8}
                          onPress={() =>
                            router.push("/dashboard/settings/reader-settings")
                          }
                        >
                          <SymbolOrAa color={isDark ? "#fff" : "#000"} />
                        </Pressable>
                      )}
                      <BookmarkLinkTypeSelector
                        type={displayedBookmarkLinkType}
                        onChange={(type) => setBookmarkLinkType(type)}
                        bookmark={displayedBookmark}
                      />
                    </View>
                  ) : undefined,
              }),
        }}
      />
      <ReaderChromeContext.Provider value={setIsChromeHidden}>
        {comp}
      </ReaderChromeContext.Provider>
      {shouldUseGlassPill && !hostsThirdPartyPage ? (
        <Animated.View
          style={[
            { position: "absolute", left: 0, right: 0, bottom: 0 },
            toolbarStyle,
          ]}
        >
          <BottomActions bookmark={displayedBookmark} />
        </Animated.View>
      ) : (
        <BottomActions bookmark={displayedBookmark} />
      )}
    </KeyboardAvoidingView>
  );
}
