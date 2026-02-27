import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import useAppSettings from "@/lib/settings";
import { useScrollDirection } from "@/lib/useScrollDirection";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const isIOS26 =
  Platform.OS === "ios" && parseInt(Platform.Version as string, 10) >= 26;

// Standard iOS navigation bar height (points)
const NAV_BAR_HEIGHT = 44;

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
    settings.defaultBookmarkView,
  );

  const { barsVisible, onScrollOffsetChange } = useScrollDirection();

  // Animate footer translateY
  const footerHeight = useSharedValue(0);
  const footerTranslateY = useSharedValue(0);
  const [footerLayoutHeight, setFooterLayoutHeight] = useState(0);

  useEffect(() => {
    footerTranslateY.value = withTiming(
      barsVisible ? 0 : footerHeight.value + insets.bottom + 16,
      { duration: 250 },
    );
  }, [barsVisible, footerTranslateY, footerHeight, insets.bottom]);

  // Only toggle the native header on iOS 26 where it's transparent and
  // doesn't participate in layout. On older iOS / Android the opaque header
  // causes a layout reflow that makes the footer icons jump and flicker.
  useEffect(() => {
    if (isIOS26) {
      navigation.setOptions({ headerShown: barsVisible });
    }
  }, [barsVisible, navigation]);

  const footerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: footerTranslateY.value }],
  }));

  const onFooterLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      footerHeight.value = h;
      setFooterLayoutHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
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
  // Footer is absolutely positioned on all platforms, so content always
  // needs bottom inset to avoid being hidden behind it.
  const contentInsetBottom = footerLayoutHeight;

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
      <Stack.Screen
        options={{
          headerTitle: title ?? "",
          headerBackTitle: "Back",
          headerShown: true,
          ...headerPlatformOptions,
          headerTintColor: isDark ? "#fff" : "#000",
          headerRight: () =>
            bookmark.content.type === BookmarkTypes.LINK ? (
              <View className="flex-row items-center gap-3 px-4">
                {bookmarkLinkType === "reader" && (
                  <Pressable
                    onPress={() =>
                      router.push("/dashboard/settings/reader-settings")
                    }
                  >
                    <Settings size={20} color="gray" />
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
          footerAnimatedStyle,
          {
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
