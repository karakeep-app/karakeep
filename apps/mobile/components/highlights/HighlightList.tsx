import { useRef } from "react";
import { ActivityIndicator, Keyboard, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import EmptyState from "@/components/ui/EmptyState";
import { getGridColumns, useContainerWidth } from "@/lib/responsive";
import { useScrollToTop } from "expo-router";
import { Highlighter } from "lucide-react-native";

import type { ZHighlight } from "@karakeep/shared/types/highlights";

import HighlightCard from "./HighlightCard";

const HORIZONTAL_MARGIN = 15;
const GAP = 15;

export default function HighlightList({
  highlights,
  header,
  onRefresh,
  fetchNextPage,
  isFetchingNextPage,
  isRefreshing,
}: {
  highlights: ZHighlight[];
  onRefresh: () => void;
  isRefreshing: boolean;
  fetchNextPage?: () => void;
  header?: React.ReactElement;
  isFetchingNextPage?: boolean;
}) {
  const flatListRef = useRef(null);
  useScrollToTop(flatListRef);
  const { width: containerWidth, onLayout } = useContainerWidth();
  const { numColumns, columnWidth } = getGridColumns({
    containerWidth,
    horizontalInset: HORIZONTAL_MARGIN,
    gap: GAP,
    minColumnWidth: 340,
  });

  return (
    <View className="flex-1" onLayout={onLayout}>
      <Animated.FlatList
        ref={flatListRef}
        // FlatList doesn't support changing numColumns on the fly.
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: GAP } : undefined}
        // Reanimated only supports item layout animations in single-column lists.
        itemLayoutAnimation={numColumns > 1 ? undefined : LinearTransition}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
        contentContainerStyle={{
          gap: GAP,
          marginHorizontal: HORIZONTAL_MARGIN,
          marginBottom: 15,
        }}
        renderItem={(h) =>
          numColumns > 1 ? (
            <View style={{ width: columnWidth }}>
              <HighlightCard highlight={h.item} />
            </View>
          ) : (
            <HighlightCard highlight={h.item} />
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon={Highlighter}
            title="No Highlights"
            subtitle="Highlights you create will appear here"
          />
        }
        data={highlights}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        onScrollBeginDrag={Keyboard.dismiss}
        keyExtractor={(h) => h.id}
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
