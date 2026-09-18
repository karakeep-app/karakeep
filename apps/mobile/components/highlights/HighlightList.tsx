import { useRef } from "react";
import { ActivityIndicator, Keyboard, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import EmptyState from "@/components/ui/EmptyState";
import { useScrollToTop } from "expo-router";
import { useTranslation } from "@/lib/i18n/hooks";
import { Highlighter } from "lucide-react-native";

import type { ZHighlight } from "@karakeep/shared/types/highlights";

import HighlightCard from "./HighlightCard";

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
  const { t } = useTranslation();
  useScrollToTop(flatListRef);

  return (
    <Animated.FlatList
      ref={flatListRef}
      itemLayoutAnimation={LinearTransition}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={header}
      contentContainerStyle={{
        gap: 15,
        marginHorizontal: 15,
        marginBottom: 15,
      }}
      renderItem={(h) => <HighlightCard highlight={h.item} />}
      ListEmptyComponent={
        <EmptyState
          icon={Highlighter}
          title={t("highlights.empty_title")}
          subtitle={t("highlights.empty_subtitle")}
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
  );
}
