import { ActivityIndicator, Keyboard, View } from "react-native";
import Animated from "react-native-reanimated";
import EmptyState from "@/components/ui/EmptyState";
import { getGridColumns, useContainerWidth } from "@/lib/responsive";
import { useTranslation } from "@/lib/i18n/hooks";
import { PenLine } from "lucide-react-native";

import type { ZHighlight } from "@karakeep/shared/types/highlights";

import HighlightCard from "./HighlightCard";

const HORIZONTAL_MARGIN = 16;
const GAP = 10;

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
  const { t } = useTranslation();
  // No useScrollToTop: native tabs already scroll to the inset-adjusted top on
  // re-tap, while the hook scrolls to 0 and hides the first card under the header.
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
        // FlatList doesn't support changing numColumns on the fly.
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: GAP } : undefined}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
        contentContainerStyle={{
          gap: GAP,
          marginHorizontal: HORIZONTAL_MARGIN,
          paddingBottom: 24,
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
            icon={PenLine}
            title={t("highlights.empty_title_yet")}
            subtitle={t("highlights.empty_subtitle_reader")}
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
