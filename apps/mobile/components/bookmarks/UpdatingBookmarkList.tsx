import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import useAppSettings from "@/lib/settings";
import QueryPageState from "@/components/QueryPageState";

import type { ZGetBookmarksRequest } from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import BookmarkList from "./BookmarkList";

export default function UpdatingBookmarkList({
  query,
  header,
}: {
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">; // Sort order is handled by mobile settings
  header?: React.ReactElement;
}) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { settings } = useAppSettings();
  const {
    data,
    isPending,
    isPlaceholderData,
    error,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery(
    api.bookmarks.getBookmarks.infiniteQueryOptions(
      {
        ...query,
        sortOrder: settings.bookmarkSortOrder,
        useCursorV2: true,
        includeContent: false,
      },
      {
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  if (!data) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  const onRefresh = () => {
    queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
    queryClient.invalidateQueries(api.bookmarks.getBookmark.pathFilter());
  };

  return (
    <BookmarkList
      bookmarks={data.pages
        .flatMap((p) => p.bookmarks)
        .filter((b) => b.content.type != BookmarkTypes.UNKNOWN)}
      header={header}
      onRefresh={onRefresh}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isRefreshing={isPending || isPlaceholderData}
    />
  );
}
