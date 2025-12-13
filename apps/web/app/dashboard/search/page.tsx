"use client";

import { Suspense, useEffect } from "react";
import BookmarksGrid from "@/components/dashboard/bookmarks/BookmarksGrid";
import BookmarksGridSkeleton from "@/components/dashboard/bookmarks/BookmarksGridSkeleton";
import { PageHeader } from "@/components/layout/page-header";
import { useBookmarkSearch } from "@/lib/hooks/bookmark-search";
import { useTranslation } from "@/lib/i18n/client";
import { useInSearchPageStore } from "@/lib/store/useInSearchPageStore";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { Search as SearchIcon } from "lucide-react";

function SearchComp() {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useBookmarkSearch();

  const { setInSearchPage } = useInSearchPageStore();

  const { setSortOrder } = useSortOrderStore();
  const { t } = useTranslation();

  useEffect(() => {
    // also see related cleanup code in SortOrderToggle.tsx
    setSortOrder("relevance");
  }, []);

  useEffect(() => {
    setInSearchPage(true);
    return () => setInSearchPage(false);
  }, [setInSearchPage]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={<SearchIcon className="size-5" />}
        title={t("common.search")}
      />
      {data ? (
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
    </Suspense>
  );
}
