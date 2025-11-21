import { api } from "@/lib/trpc";

import FullPageError from "../FullPageError";
import FullPageSpinner from "../ui/FullPageSpinner";
import HighlightList from "./HighlightList";

export default function UpdatingHighlightList({
  header,
}: {
  header?: React.ReactElement;
}) {
  const apiUtils = api.useUtils();
  const {
    data,
    isPending,
    isPlaceholderData,
    error,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = api.highlights.getAll.useInfiniteQuery(
    {},
    {
      initialCursor: null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  if (error) {
    return <FullPageError error={error.message} onRetry={() => refetch()} />;
  }

  if (isPending || !data) {
    return <FullPageSpinner />;
  }

  const onRefresh = () => {
    apiUtils.highlights.getAll.invalidate();
  };

  return (
    <HighlightList
      highlights={data.pages.flatMap((p) => p.highlights)}
      header={header}
      onRefresh={onRefresh}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isRefreshing={isPending || isPlaceholderData}
    />
  );
}
