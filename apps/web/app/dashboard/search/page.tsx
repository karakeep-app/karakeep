"use client";

import React, { Suspense, useRef } from "react";
import BookmarksGrid from "@/components/dashboard/bookmarks/BookmarksGrid";
import GlobalActions from "@/components/dashboard/GlobalActions";
import { SearchInput } from "@/components/dashboard/search/SearchInput";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { useBookmarkSearch } from "@/lib/hooks/bookmark-search";

function SearchComp() {
  const { data } = useBookmarkSearch();

  const inputRef: React.MutableRefObject<HTMLInputElement | null> =
    useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-[51] flex gap-2 bg-muted py-4">
        <SearchInput ref={inputRef} autoFocus={true} />
        <GlobalActions />
      </div>
      {data ? (
        <BookmarksGrid bookmarks={data.bookmarks} />
      ) : (
        <FullPageSpinner />
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
