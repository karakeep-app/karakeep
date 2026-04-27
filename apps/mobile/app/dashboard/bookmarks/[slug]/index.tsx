import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, View } from "react-native";
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
import { isIOS26, NAV_BAR_HEIGHT, shouldUseGlassPill } from "@/lib/ios";
import useAppSettings from "@/lib/settings";
import { useScrollDirection } from "@/lib/useScrollDirection";
import { COLORS } from "@/theme/colors";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

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
    // BottomActions handles its own safe-area inset internally, so the
    // measured footerHeight covers the full visible footer; translating by
    // it slides the toolbar fully off-screen.
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

  // The header is transparent on every platform (so content extends behind
  // it and stays in place when the header animates in/out), so scrollable
  // children need top padding equal to the header height.
  const contentInsetTop = insets.top + NAV_BAR_HEIGHT;
  // The toolbar floats over the content on every platform (so it can fully
  // translate off-screen when bars hide without leaving a layout gap), so
  // the scrollable content needs bottom padding equal to its height.
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

  // Use a transparent header on every platform so content stays in place
  // when bars hide/show. iOS 26 drops the explicit background colour so the
  // built-in liquid-glass effect can show through; other platforms paint the
  // same card colour the toolbar uses to keep visual hierarchy.
  const headerPlatformOptions = {
    headerTransparent: true as const,
    ...(!isIOS26 && {
      headerStyle: {
        backgroundColor: isDark ? COLORS.dark.card : COLORS.light.card,
      },
    }),
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
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
                className={`flex-row items-center gap-3${shouldUseGlassPill ? " px-2" : ""}`}
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
          footerAnimatedStyle,
          // Float the toolbar over the content so it can fully translate
          // off-screen when bars hide. The article gets bottom padding equal
          // to the toolbar's measured height (via contentInsetBottom) so its
          // content isn't obscured.
          { position: "absolute", left: 0, right: 0, bottom: 0 },
        ]}
      >
        <BottomActions bookmark={bookmark} />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
