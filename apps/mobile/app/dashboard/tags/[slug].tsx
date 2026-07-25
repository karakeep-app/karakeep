import { Stack, useLocalSearchParams } from "expo-router";
import BookmarkListHeader from "@/components/bookmarks/BookmarkListHeader";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import QueryPageState from "@/components/QueryPageState";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useArchiveFilter } from "@/lib/hooks";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

export default function TagView() {
  const { slug } = useLocalSearchParams();
  const api = useTRPC();
  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const {
    data: tag,
    error,
    refetch,
  } = useQuery(api.tags.get.queryOptions({ tagId: slug }));
  const { archived, isLoading: isSettingsLoading } = useArchiveFilter();

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: tag?.name ?? "",
          headerBackTitle: "Back",
          headerRight: () => <BookmarkListHeader />,
        }}
      />
      {!tag ? (
        <QueryPageState error={error} onRetry={() => refetch()} />
      ) : !isSettingsLoading ? (
        <UpdatingBookmarkList
          query={{
            tagId: tag.id,
            archived,
          }}
        />
      ) : (
        <FullPageSpinner />
      )}
    </>
  );
}
