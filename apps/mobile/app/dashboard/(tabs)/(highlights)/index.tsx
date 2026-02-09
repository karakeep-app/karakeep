import FullPageError from "@/components/FullPageError";
import HighlightList from "@/components/highlights/HighlightList";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

export default function Highlights() {
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
    api.highlights.getAll.infiniteQueryOptions(
      {},
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
    queryClient.invalidateQueries(api.highlights.getAll.pathFilter());
  };

  return (
    <HighlightList
      highlights={data.pages.flatMap((p) => p.highlights)}
      onRefresh={onRefresh}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isRefreshing={isPending || isPlaceholderData}
    />
  );
}
