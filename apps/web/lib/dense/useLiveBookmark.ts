import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getBookmarkRefreshInterval } from "@karakeep/shared/utils/bookmarkUtils";

/**
 * Bookmarks can arrive from the list query without a summary/tags yet
 * (crawling/tagging/summarising all happen async in the background). This
 * polls the single bookmark while it's in a pending state so the row can
 * swap from the "SUMMARISING" skeleton to the real content without a
 * manual refresh, same pattern as the existing grid's BookmarkCard.
 */
export function useLiveBookmark(initialData: ZBookmark) {
  const api = useTRPC();
  const { data } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      { bookmarkId: initialData.id },
      {
        initialData,
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) return false;
          return getBookmarkRefreshInterval(data);
        },
      },
    ),
  );
  return data;
}
