import FullPageError from "@/components/FullPageError";
import HighlightList from "@/components/highlights/HighlightList";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";

import { useTRPC } from "@karakeep/shared-react/trpc";

export default function BookmarkHighlightsPage() {
  const { slug } = useLocalSearchParams();
  const api = useTRPC();
  const queryClient = useQueryClient();

  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const { data, isPending, isPlaceholderData, error, refetch } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId: slug,
    }),
  );

  if (error) {
    return <FullPageError error={error.message} onRetry={() => refetch()} />;
  }

  if (isPending || !data) {
    return <FullPageSpinner />;
  }

  const onRefresh = () => {
    queryClient.invalidateQueries(
      api.highlights.getForBookmark.queryFilter({
        bookmarkId: slug,
      }),
    );
  };

  return (
    <HighlightList
      highlights={data.highlights}
      onRefresh={onRefresh}
      isRefreshing={isPending || isPlaceholderData}
    />
  );
}
