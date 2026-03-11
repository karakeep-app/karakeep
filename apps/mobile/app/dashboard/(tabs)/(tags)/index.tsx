import { useEffect, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Link } from "expo-router";
import FullPageError from "@/components/FullPageError";
import ChevronRight from "@/components/ui/ChevronRight";
import EmptyState from "@/components/ui/EmptyState";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { SearchInput } from "@/components/ui/SearchInput";
import { Text } from "@/components/ui/Text";
import { useQueryClient } from "@tanstack/react-query";
import { Tag } from "lucide-react-native";

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
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const api = useTRPC();
  const queryClient = useQueryClient();

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
    isFetchingNextPage,
  } = usePaginatedSearchTags({
    limit: 50,
    sortBy: debouncedSearch ? "relevance" : "usage",
    nameContains: debouncedSearch,
  });

  useEffect(() => {
    setRefreshing(isPending);
  }, [isPending]);

  if (error) {
    return <FullPageError error={error.message} onRetry={() => refetch()} />;
  }

  if (!data) {
    return <FullPageSpinner />;
  }

  const onRefresh = () => {
    queryClient.invalidateQueries(api.tags.list.pathFilter());
  };

  const tags: TagItem[] = data.tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    numBookmarks: tag.numBookmarks,
    href: `/dashboard/tags/${tag.id}`,
  }));

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <FlatList
      className="h-full"
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        <SearchInput
          containerClassName="mx-2 mb-2"
          placeholder="Search tags..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      }
      contentContainerStyle={{
        gap: 6,
        paddingBottom: 20,
      }}
      renderItem={(item) => (
        <View
          className="mx-2 flex flex-row items-center rounded-xl bg-card px-4 py-2"
          style={{ borderCurve: "continuous" }}
        >
          <Link
            asChild
            key={item.item.id}
            href={item.item.href}
            className="flex-1"
          >
            <Pressable className="flex flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="font-medium">{item.item.name}</Text>
                <Text className="text-sm text-muted-foreground">
                  {item.item.numBookmarks}{" "}
                  {item.item.numBookmarks === 1 ? "bookmark" : "bookmarks"}
                </Text>
              </View>
              <ChevronRight />
            </Pressable>
          </Link>
        </View>
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
              Loading more...
            </Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        !isPending ? (
          <EmptyState
            icon={Tag}
            title="No Tags"
            subtitle="Tags will appear as you organize your bookmarks"
          />
        ) : null
      }
    />
  );
}
