import { useState } from "react";
import { KeyboardAvoidingView, Pressable, View } from "react-native";
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
import { shouldUseGlassPill } from "@/lib/ios";
import useAppSettings from "@/lib/settings";
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

  let comp;
  let title = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      title = bookmark.title ?? bookmark.content.title;
      comp = (
        <BookmarkLinkView
          bookmark={bookmark}
          bookmarkPreviewType={bookmarkLinkType}
        />
      );
      break;
    case BookmarkTypes.TEXT:
      title = bookmark.title;
      comp = <BookmarkTextView bookmark={bookmark} />;
      break;
    case BookmarkTypes.ASSET:
      title = bookmark.title ?? bookmark.content.fileName;
      comp = <BookmarkAssetView bookmark={bookmark} />;
      break;
  }
  return (
    <KeyboardAvoidingView
      // On iOS 26 the toolbar is absolute-positioned so its GlassView has
      // content behind it; its own bottomMargin handles the safe-area inset,
      // so padding here would leave a visible gap below the glass pill.
      style={{
        flex: 1,
        paddingBottom: shouldUseGlassPill ? 0 : insets.bottom + 8,
      }}
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
      {shouldUseGlassPill ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          <BottomActions bookmark={bookmark} />
        </View>
      ) : (
        <BottomActions bookmark={bookmark} />
      )}
    </KeyboardAvoidingView>
  );
}
