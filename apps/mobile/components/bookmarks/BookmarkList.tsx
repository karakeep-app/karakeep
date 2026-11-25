import { use, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  View,
} from "react-native";
import {
  FlatList as GestureFlatList,
  RefreshControl,
} from "react-native-gesture-handler";
import EmptyState from "@/components/ui/EmptyState";
import { useTranslation } from "@/lib/i18n/hooks";
import { getGridColumns, useContainerWidth } from "@/lib/responsive";
import useAppSettings from "@/lib/settings";
import { useMutationState } from "@tanstack/react-query";
import { useScrollToTop } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import type { LucideIcon } from "lucide-react-native";
import { Bookmark } from "lucide-react-native";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";

import BookmarkCard from "./BookmarkCard";

const HORIZONTAL_MARGIN = 16;
const GAP = 10;
// Leaves the last card's actions clear of the Android add button.
const BOTTOM_PADDING = Platform.OS === "android" ? 96 : 24;
const NO_SCROLL_TARGET = { current: null };

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
  scrollToTopOnSave,
}: {
  bookmarks: ZBookmark[];
  onRefresh: () => void;
  isRefreshing: boolean;
  fetchNextPage?: () => void;
  header?: React.ReactElement;
  isFetchingNextPage?: boolean;
  emptyState?: BookmarkListEmptyState;
  scrollToTopOnSave?: boolean;
}) {
  const flatListRef = useRef<FlatList<ZBookmark>>(null);
  const { t } = useTranslation();
  // On iOS, native tabs already scroll to the inset-adjusted top on re-tap, and
  // the hook would then scroll to 0, hiding the first card under the header. On
  // Android the native re-tap doesn't find this list, so the hook does it.
  useScrollToTop(Platform.OS === "android" ? flatListRef : NO_SCROLL_TARGET);
  const { settings } = useAppSettings();
  // A bookmark saved from this device lands at the top (re-saving an existing
  // link bumps it there too), which may be out of sight, leaving people to
  // wonder whether it saved. Follow their own saves rather than every change
  // in the data, which also arrives from refetches.
  const api = useTRPC();
  const saveIds = useMutationState({
    filters: {
      mutationKey: api.bookmarks.createBookmark.mutationKey(),
      status: "success",
    },
    select: (m) => m.mutationId,
  });
  // Saves can finish out of order, so remember each one rather than the latest.
  const handledSaveIds = useRef(new Set(saveIds));
  // The list scrolls under the transparent header, so its visible top is above
  // zero.
  const headerHeight = use(HeaderHeightContext) ?? 0;
  useEffect(() => {
    const newSaveIds = saveIds.filter((id) => !handledSaveIds.current.has(id));
    if (newSaveIds.length === 0) {
      return;
    }
    newSaveIds.forEach((id) => handledSaveIds.current.add(id));
    if (scrollToTopOnSave && settings.bookmarkSortOrder === "desc") {
      flatListRef.current?.scrollToOffset({
        offset: -headerHeight,
        animated: true,
      });
    }
  }, [saveIds]);
  const { width: containerWidth, onLayout } = useContainerWidth();
  const { numColumns, columnWidth } = getGridColumns({
    containerWidth,
    horizontalInset: HORIZONTAL_MARGIN,
    gap: GAP,
    minColumnWidth: settings.bookmarkLayout === "list" ? 420 : 340,
  });

  return (
    <View className="flex-1" onLayout={onLayout}>
      {/* A gesture-handler list, so a scroll cancels the cards' swipe gesture.
          Gesture-handler 3 no longer does that for a plain FlatList on Android,
          and swipes kept taking over scrolls. */}
      <GestureFlatList
        ref={flatListRef}
        // FlatList doesn't support changing numColumns on the fly.
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: GAP } : undefined}
        contentInsetAdjustmentBehavior="automatic"
        // Lets scrollToOffset reach the header-adjusted top.
        scrollToOverflowEnabled
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
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        onScrollBeginDrag={Keyboard.dismiss}
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
