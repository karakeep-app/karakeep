"use client";

import { Suspense, useEffect } from "react";
import BookmarksGrid from "@/components/dashboard/bookmarks/BookmarksGrid";
import BookmarksGridSkeleton from "@/components/dashboard/bookmarks/BookmarksGridSkeleton";
import { MobileSearchHome } from "@/components/dashboard/dense/mobile/MobileSearchHome";
import {
  useBookmarkSearch,
  useBookmarkSearchState,
} from "@/lib/hooks/bookmark-search";
import { useInSearchPageStore } from "@/lib/store/useInSearchPageStore";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";

function SearchComp() {
  const { searchQuery } = useBookmarkSearchState();
  const hasQuery = searchQuery.trim().length > 0;

  // Gated on there being something to search for. Previously this fired a
  // `searchBookmarks` request for `""` whenever the page was opened without
  // a query, and then `throw error` below turned any failure into the
  // dashboard's error boundary. On a server with no search backend
  // configured that empty request always fails, so simply landing on
  // /dashboard/search crashed the route — and because this page also hosts
  // the mobile Search tab (the mobile shell's default landing tab), it took
  // that whole screen down with it, on a query the user never typed.
  const { data, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useBookmarkSearch({ enabled: hasQuery });

  const { setInSearchPage } = useInSearchPageStore();

  const { setSortOrder } = useSortOrderStore();

  useEffect(() => {
    // also see related cleanup code in SortOrderToggle.tsx
    setSortOrder("relevance");
  }, [setSortOrder]);

  useEffect(() => {
    setInSearchPage(true);
    return () => setInSearchPage(false);
  }, [setInSearchPage]);

  if (error) {
    throw error;
  }

  return (
    <div className="hidden flex-col gap-3 sm:flex">
      {!hasQuery ? (
        // With the query gated off there is no request in flight, so the
        // skeleton would spin forever — say what the screen is waiting for
        // instead.
        <p className="text-k-fg-dim py-[40px] text-center text-sm">
          Search your bookmarks from the field above.
        </p>
      ) : data ? (
        <BookmarksGrid
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          bookmarks={data.pages.flatMap((b) => b.bookmarks)}
        />
      ) : (
        <BookmarksGridSkeleton />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchComp />
      <MobileSearchHome />
    </Suspense>
  );
}
