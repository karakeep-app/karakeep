import { useState } from "react";
import { FlatList, Platform, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Link, router, Stack } from "expo-router";
import { AppIcon } from "@/components/ui/AppIcon";
import QueryPageState from "@/components/QueryPageState";
import { ProfileAvatarButton } from "@/components/settings/ProfileAvatarButton";
import ChevronRight from "@/components/ui/ChevronRight";
import EmptyState from "@/components/ui/EmptyState";
import { FAB } from "@/components/ui/FAB";
import { SearchInput } from "@/components/ui/SearchInput";
import { GroupedListRow } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { READABLE_CONTENT_MAX_WIDTH } from "@/lib/responsive";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Tag } from "lucide-react-native";

import { usePaginatedSearchTags } from "@karakeep/shared-react/hooks/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";

interface TagItem {
  id: string;
  name: string;
  numBookmarks: number;
  href: string;
}

export default function Tags() {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { colors } = useColorScheme();

  const openNewTag = () => {
    void Haptics.selectionAsync();
    router.push("/dashboard/tags/new");
  };

  // Debounce search query to avoid too many API calls
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch tags sorted by usage (most used first)
  const {
    data,
    isPending,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = usePaginatedSearchTags({
    limit: 50,
    sortBy: debouncedSearch ? "relevance" : "usage",
    nameContains: debouncedSearch,
  });

  if (!data) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries(api.tags.list.pathFilter());
    } finally {
      setRefreshing(false);
    }
  };

  const tags: TagItem[] = data.tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    numBookmarks: tag.numBookmarks,
    href: `/dashboard/tags/${tag.id}`,
  }));

  const handleLoadMore = () => {
    if (hasNextPage && !isFetching) {
      void fetchNextPage({ cancelRefetch: false });
    }
  };

  return (
    <>
      {Platform.OS === "ios" && (
        <Stack.Screen
          options={{
            headerRight: () => (
              <View className="flex-row items-center gap-3 px-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("tags_tab.new_tag")}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center active:opacity-60"
                  onPress={openNewTag}
                >
                  <AppIcon icon={Plus} size={21} color={colors.foreground} />
                </Pressable>
                <ProfileAvatarButton />
              </View>
            ),
          }}
        />
      )}
      <FlatList
        className="h-full"
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <SearchInput
            containerClassName="mb-3"
            placeholder={t("tags_tab.search_placeholder")}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        }
        contentContainerStyle={{
          paddingBottom: Platform.OS === "android" ? 96 : 32,
          paddingHorizontal: 16,
          width: "100%",
          maxWidth: READABLE_CONTENT_MAX_WIDTH,
          alignSelf: "center",
        }}
        renderItem={({ item, index }) => (
          <GroupedListRow
            isFirst={index === 0}
            isLast={index === tags.length - 1}
          >
            <Link asChild key={item.id} href={item.href}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("tags_tab.row_label", {
                  name: item.name,
                  count: item.numBookmarks,
                })}
                className="min-h-11 flex-row items-center gap-3 px-4 py-2.5 active:opacity-70"
              >
                <Text className="flex-1" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  variant="subhead"
                  color="tertiary"
                  className="tabular-nums"
                >
                  {item.numBookmarks}
                </Text>
                <ChevronRight size={18} />
              </Pressable>
            </Link>
          </GroupedListRow>
        )}
        data={tags}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4">
              <Text className="text-center text-muted-foreground">
                {t("tags_tab.loading_more")}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isPending ? (
            <EmptyState
              icon={Tag}
              title={
                debouncedSearch
                  ? t("tags_tab.no_matching_title")
                  : t("tags_tab.no_tags_yet_title")
              }
              subtitle={
                debouncedSearch
                  ? t("tags_tab.no_matching_subtitle")
                  : t("tags_tab.no_tags_yet_subtitle")
              }
            />
          ) : null
        }
      />
      {Platform.OS === "android" && (
        <FAB>
          <Pressable
            accessibilityLabel={t("tags_tab.new_tag")}
            accessibilityRole="button"
            className="h-full w-full items-center justify-center"
            onPress={openNewTag}
          >
            <Plus size={24} color="white" />
          </Pressable>
        </FAB>
      )}
    </>
  );
}
