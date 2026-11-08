import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import EmptyState from "@/components/ui/EmptyState";
import { useTranslation } from "@/lib/i18n/hooks";
import { getGridColumns, useContainerWidth } from "@/lib/responsive";
import useAppSettings from "@/lib/settings";
import { useScrollToTop } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Bookmark } from "lucide-react-native";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import BookmarkCard from "./BookmarkCard";

const HORIZONTAL_MARGIN = 16;
const GAP = 10;
// Leaves the last card's actions clear of the Android add button.
const BOTTOM_PADDING = Platform.OS === "android" ? 96 : 24;

export interface BookmarkListEmptyState {
  icon?: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function BookmarkList({
  bookmarks,
  header,
  onRefresh,
  fetchNextPage,
  isFetchingNextPage,
  isRefreshing,
  emptyState,
}: {
  bookmarks: ZBookmark[];
  onRefresh: () => void;
  isRefreshing: boolean;
  fetchNextPage?: () => void;
  header?: React.ReactElement;
  isFetchingNextPage?: boolean;
  emptyState?: BookmarkListEmptyState;
}) {
  const flatListRef = useRef<FlatList<ZBookmark>>(null);
  const { t } = useTranslation();
  useScrollToTop(flatListRef);
  const { settings } = useAppSettings();
  // A new item at the top would otherwise land out of sight, leaving people to
  // wonder whether it saved.
  const firstBookmarkId = bookmarks[0]?.id;
  const previousFirstBookmarkId = useRef(firstBookmarkId);
  const previousCount = useRef(bookmarks.length);
  const topInset = useRef(0);
  useEffect(() => {
    const addedAtTop =
      previousFirstBookmarkId.current !== undefined &&
      firstBookmarkId !== previousFirstBookmarkId.current &&
      bookmarks.length > previousCount.current;
    previousFirstBookmarkId.current = firstBookmarkId;
    previousCount.current = bookmarks.length;
    if (addedAtTop) {
      // The list scrolls under the header, so its visible top is above zero.
      flatListRef.current?.scrollToOffset({
        offset: -topInset.current,
        animated: true,
      });
    }
  }, [firstBookmarkId, bookmarks.length]);
  const { width: containerWidth, onLayout } = useContainerWidth();
  const { numColumns, columnWidth } = getGridColumns({
    containerWidth,
    horizontalInset: HORIZONTAL_MARGIN,
    gap: GAP,
    minColumnWidth: settings.bookmarkLayout === "list" ? 420 : 340,
  });

  return (
    <View className="flex-1" onLayout={onLayout}>
      <Animated.FlatList
        ref={flatListRef}
        // FlatList doesn't support changing numColumns on the fly.
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: GAP } : undefined}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
        contentContainerStyle={{
          gap: GAP,
          marginHorizontal: HORIZONTAL_MARGIN,
          paddingBottom: BOTTOM_PADDING,
        }}
        renderItem={(b) =>
          numColumns > 1 ? (
            <View style={{ width: columnWidth }}>
              <BookmarkCard bookmark={b.item} />
            </View>
          ) : (
            <BookmarkCard bookmark={b.item} />
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon={emptyState?.icon ?? Bookmark}
            title={emptyState?.title ?? t("bookmarks.empty_title")}
            subtitle={emptyState?.subtitle ?? t("bookmarks.empty_subtitle")}
            actionLabel={emptyState?.actionLabel}
            onAction={emptyState?.onAction}
          />
        }
        data={bookmarks}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        onScrollBeginDrag={(event) => {
          Keyboard.dismiss();
          topInset.current = event.nativeEvent.contentInset?.top ?? 0;
        }}
        keyExtractor={(b) => b.id}
        onEndReached={fetchNextPage}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center">
              <ActivityIndicator />
            </View>
          ) : (
            <View />
          )
        }
      />
    </View>
  );
}
