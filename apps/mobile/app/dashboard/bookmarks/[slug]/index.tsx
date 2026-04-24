import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import BookmarkAssetView from "@/components/bookmarks/BookmarkAssetView";
import BookmarkLinkTypeSelector, {
  BookmarkLinkType,
} from "@/components/bookmarks/BookmarkLinkTypeSelector";
import BookmarkLinkView from "@/components/bookmarks/BookmarkLinkView";
import BookmarkTextView from "@/components/bookmarks/BookmarkTextView";
import BottomActions from "@/components/bookmarks/BottomActions";
import FullPageError from "@/components/FullPageError";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { isIOS26 } from "@/lib/ios";
import useAppSettings from "@/lib/settings";
import { useScrollDirection } from "@/lib/useScrollDirection";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

// Standard iOS navigation bar height (points)
const NAV_BAR_HEIGHT = 44;

function KeepScreenOn() {
  useKeepAwake();
  return null;
}

export default function BookmarkView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { slug } = useLocalSearchParams();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { settings } = useAppSettings();
  const api = useTRPC();

  const [bookmarkLinkType, setBookmarkLinkType] = useState<BookmarkLinkType>(
    settings.defaultBookmarkView === "externalBrowser"
      ? "browser"
      : settings.defaultBookmarkView,
  );

  const { barsVisible, onScrollOffsetChange } = useScrollDirection();

  // Animate footer translateY
  const footerHeight = useSharedValue(0);
  const footerTranslateY = useSharedValue(0);
  const [footerLayoutHeight, setFooterLayoutHeight] = useState(0);

  useEffect(() => {
    // footerHeight already includes the bottom safe-area inset via the
    // wrapper's paddingBottom, so translating by the measured height is enough
    // to slide the toolbar fully off-screen.
    footerTranslateY.value = withTiming(barsVisible ? 0 : footerHeight.value, {
      duration: 250,
    });
  }, [barsVisible, footerTranslateY, footerHeight]);

  // Toggle native header visibility
  useEffect(() => {
    navigation.setOptions({ headerShown: barsVisible });
  }, [barsVisible, navigation]);

  const footerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: footerTranslateY.value }],
  }));

  const onFooterLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      footerHeight.value = e.nativeEvent.layout.height;
      setFooterLayoutHeight(e.nativeEvent.layout.height);
    },
    [footerHeight],
  );

  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const {
    data: bookmark,
    error,
    refetch,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions({
      bookmarkId: slug,
      includeContent: false,
    }),
  );

  if (error) {
    return <FullPageError error={error.message} onRetry={refetch} />;
  }

  if (!bookmark) {
    return <FullPageSpinner />;
  }

  // On iOS 26 the header is transparent and content extends behind it,
  // so scrollable children need top padding equal to the header height.
  // Applied via contentInset so the background extends edge-to-edge.
  const contentInsetTop = isIOS26 ? insets.top + NAV_BAR_HEIGHT : 0;
  const contentInsetBottom = isIOS26 ? footerLayoutHeight : 0;

  let comp;
  let title = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      title = bookmark.title ?? bookmark.content.title;
      comp = (
        <BookmarkLinkView
          bookmark={bookmark}
          bookmarkPreviewType={bookmarkLinkType}
          onScrollOffsetChange={onScrollOffsetChange}
          barsVisible={barsVisible}
          contentInsetTop={contentInsetTop}
          contentInsetBottom={contentInsetBottom}
        />
      );
      break;
    case BookmarkTypes.TEXT:
      title = bookmark.title;
      comp = (
        <BookmarkTextView
          bookmark={bookmark}
          onScrollOffsetChange={onScrollOffsetChange}
          contentInsetTop={contentInsetTop}
          contentInsetBottom={contentInsetBottom}
        />
      );
      break;
    case BookmarkTypes.ASSET:
      title = bookmark.title ?? bookmark.content.fileName;
      comp = <BookmarkAssetView bookmark={bookmark} />;
      break;
  }

  const headerPlatformOptions = isIOS26
    ? { headerTransparent: true as const }
    : {
        headerTransparent: false as const,
        headerStyle: { backgroundColor: isDark ? "#000" : "#fff" },
      };

  return (
    <View style={{ flex: 1 }}>
      {settings.keepScreenOnWhileReading && <KeepScreenOn />}
      <Stack.Screen
        options={{
          headerTitle: title ?? "",
          headerBackTitle: "Back",
          headerShown: true,
          ...headerPlatformOptions,
          headerTintColor: isDark ? "#fff" : "#000",
          headerRight: () =>
            bookmark.content.type === BookmarkTypes.LINK ? (
              <View
                className={`flex-row items-center gap-3${isIOS26 ? " px-2" : ""}`}
              >
                {bookmarkLinkType === "reader" && (
                  <Pressable
                    onPress={() =>
                      router.push("/dashboard/settings/reader-settings")
                    }
                  >
                    <Settings size={20} color={isDark ? "#fff" : "#000"} />
                  </Pressable>
                )}
                <BookmarkLinkTypeSelector
                  type={bookmarkLinkType}
                  onChange={(type) => setBookmarkLinkType(type)}
                  bookmark={bookmark}
                />
              </View>
            ) : undefined,
        }}
      />
      {comp}
      <Animated.View
        onLayout={onFooterLayout}
        style={[
          // BottomActions is the old static toolbar: it has no background and
          // doesn't apply its own safe-area inset. The wrapper supplies both so
          // the footer stays opaque and clears the home indicator in both
          // in-flow and absolute-positioned (iOS 26) modes.
          //
          // The background color is applied inline (not via `className`)
          // because NativeWind-injected styles and Reanimated transforms can
          // land on different view nodes on Android — causing the background
          // to stay painted while the children translate off-screen.
          {
            backgroundColor: isDark ? "#000" : "#fff",
            paddingBottom: insets.bottom + 8,
          },
          footerAnimatedStyle,
          isIOS26 && {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
          },
        ]}
      >
        <BottomActions bookmark={bookmark} />
      </Animated.View>
    </View>
  );
}
