import { FlatList, Pressable, ScrollView, View } from "react-native";
import BookmarkList from "@/components/bookmarks/BookmarkList";
import QueryPageState from "@/components/QueryPageState";
import EmptyState from "@/components/ui/EmptyState";
import { GroupedListRow } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import { Search, SearchX } from "lucide-react-native";
import { READABLE_CONTENT_MAX_WIDTH } from "@/lib/responsive";

import type { BookmarkSearchState } from "@/lib/useBookmarkSearchState";

interface BookmarkSearchResultsProps {
  rawSearch: string;
  isInputFocused: boolean;
  state: BookmarkSearchState;
  onSelectHistory: (term: string) => void;
  header?: React.ReactElement;
}

export default function BookmarkSearchResults({
  rawSearch,
  state,
  onSelectHistory,
  header,
}: BookmarkSearchResultsProps) {
  const { t } = useTranslation();
  const {
    history,
    filteredHistory,
    clearHistory,
    data,
    error,
    refetch,
    isPending,
    onEndReached,
    isFetchingNextPage,
    onRefresh,
  } = state;

  const renderHistoryItem = ({
    item,
    index,
  }: {
    item: string;
    index: number;
  }) => (
    <View className="px-4">
      <GroupedListRow
        isFirst={index === 0}
        isLast={index === filteredHistory.length - 1}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelectHistory(item)}
          className="min-h-11 justify-center px-4 py-2.5 active:opacity-70"
        >
          <Text numberOfLines={1}>{item}</Text>
        </Pressable>
      </GroupedListRow>
    </View>
  );

  if (rawSearch.trim().length === 0) {
    return (
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          width: "100%",
          maxWidth: READABLE_CONTENT_MAX_WIDTH,
          alignSelf: "center",
        }}
        data={filteredHistory}
        renderItem={renderHistoryItem}
        keyExtractor={(item, index) => `${item}-${index}`}
        ListHeaderComponent={
          <View>
            {header}
            {history.length > 0 && (
              <View className="flex-row items-center justify-between px-8 pb-1.5 pt-4">
                <Text variant="footnote" color="tertiary" className="uppercase">
                  {t("search.recent")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={clearHistory}
                >
                  <Text variant="footnote" className="text-primary">
                    {t("search.clear")}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Search}
            title={t("search.empty_title")}
            subtitle={t("search.empty_subtitle")}
          />
        }
        keyboardShouldPersistTaps="handled"
      />
    );
  }

  if (error?.message.toLowerCase().includes("not configured")) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <EmptyState
          icon={SearchX}
          title={t("search.unavailable_title")}
          subtitle={t("search.unavailable_subtitle")}
        />
      </ScrollView>
    );
  }

  if (!data) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  return (
    <BookmarkList
      bookmarks={data.pages.flatMap((p) => p.bookmarks)}
      fetchNextPage={onEndReached}
      isFetchingNextPage={isFetchingNextPage}
      onRefresh={onRefresh}
      isRefreshing={isPending}
      header={header}
      emptyState={{
        icon: SearchX,
        title: t("search.no_results_title"),
        subtitle: t("search.no_results_subtitle", { query: rawSearch.trim() }),
      }}
    />
  );
}
