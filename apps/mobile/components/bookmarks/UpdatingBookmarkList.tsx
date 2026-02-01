import { useTRPC } from "@/lib/trpc";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import type { ZGetBookmarksRequest } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import FullPageError from "../FullPageError";
import FullPageSpinner from "../ui/FullPageSpinner";
import BookmarkList from "./BookmarkList";

export default function UpdatingBookmarkList({
  query,
  header,
}: {
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">; // Sort order is not supported in mobile yet
  header?: React.ReactElement;
}) {
  const api = useTRPC();
  const queryClient = useQueryClient();
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
      { ...query, useCursorV2: true, includeContent: false },
      {
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  if (error) {
    return <FullPageError error={error.message} onRetry={() => refetch()} />;
  }

  if (isPending || !data) {
    return <FullPageSpinner />;
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
