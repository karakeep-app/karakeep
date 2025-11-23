import { useEffect, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Link } from "expo-router";
import FullPageError from "@/components/FullPageError";
import ChevronRight from "@/components/ui/ChevronRight";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import PageTitle from "@/components/ui/PageTitle";
import { SearchInput } from "@/components/ui/SearchInput";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/trpc";

import { usePaginatedSearchTags } from "@karakeep/shared-react/hooks/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";

interface TagItem {
  id: string;
  name: string;
  numBookmarks: number;
  href: string;
}

export default function Tags() {
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const apiUtils = api.useUtils();

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
    apiUtils.tags.list.invalidate();
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
    <CustomSafeAreaView>
      <FlatList
        className="h-full"
        ListHeaderComponent={
          <View>
            <PageTitle title="Tags" />
            <SearchInput
              containerClassName="mx-2 mb-2"
              placeholder="Search tags..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        }
        contentContainerStyle={{
          gap: 5,
        }}
        renderItem={(item) => (
          <View className="mx-2 flex flex-row items-center rounded-xl border border-input bg-card px-4 py-2">
            <Link
              asChild
              key={item.item.id}
              href={item.item.href}
              className="flex-1"
            >
              <Pressable className="flex flex-row justify-between">
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
            <View className="py-8">
              <Text className="text-center text-muted-foreground">
                No tags yet
              </Text>
            </View>
          ) : null
        }
      />
    </CustomSafeAreaView>
  );
}
