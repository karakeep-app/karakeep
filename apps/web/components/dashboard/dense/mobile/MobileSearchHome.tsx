"use client";

import { useEffect, useRef, useState } from "react";
import { DenseBookmarkRow } from "@/components/dashboard/dense/DenseBookmarkRow";
import {
  useBookmarkSearch,
  useBookmarkSearchState,
  useDoBookmarkSearch,
} from "@/lib/hooks/bookmark-search";
import { cn } from "@/lib/utils";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { gsap } from "gsap";
import Lenis from "lenis";
import { Search, X } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

/**
 * The mobile "search()" screen (design/Keepsake Mobile Designs.html,
 * screen 2b) — search doubles as home: an empty query shows the plain
 * queue (same `{ archived: false }` query the desktop Files page uses),
 * typing turns the same screen into retrieval via the existing search
 * infrastructure (`useBookmarkSearch`, `useDoBookmarkSearch` — the same
 * hooks the desktop search page already uses, so this is one more
 * consumer of them, not a parallel search implementation).
 *
 * Rendered alongside the desktop `SearchComp` on the same
 * `/dashboard/search` route, `sm:hidden` — see the page component.
 *
 * Deliberately not built, and not silently faked either:
 * - The design's everything/summaries/tags/archive filter pills don't
 *   correspond to a real filter on `searchBookmarks` today (it takes a
 *   text query and a search mode, not a result-type facet), so building
 *   them would mean either wiring pills that quietly do nothing or
 *   inventing a filter the API can't serve. Left out rather than faked.
 * - Matched-term highlighting: `DenseBookmarkRow` (reused here for both
 *   the queue and search results, inheriting its existing click/selection
 *   fixes) has no notion of match spans, and the search endpoint doesn't
 *   return them. A real feature, not a styling tweak.
 * - `ask_summaries()` — the design's natural-language "ask your summaries
 *   a question" row — is a new AI feature with no existing endpoint
 *   behind it, not a UI decision.
 */
export function MobileSearchHome() {
  const api = useTRPC();
  const { searchQuery } = useBookmarkSearchState();
  const { debounceSearch } = useDoBookmarkSearch();
  const [inputValue, setInputValue] = useState(searchQuery);

  const hasQuery = searchQuery.trim().length > 0;

  const queueResult = useInfiniteQuery(
    api.bookmarks.getBookmarks.infiniteQueryOptions(
      {
        archived: false,
        sortOrder: "desc",
        includeContent: false,
        useCursorV2: true,
      },
      {
        enabled: !hasQuery,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const searchResult = useBookmarkSearch();

  const {
    data,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isPending,
    error,
  } = hasQuery
    ? searchResult
    : {
        ...queueResult,
        isPending: queueResult.isPending,
        error: queueResult.error,
      };

  const bookmarks = data?.pages.flatMap((p) => p.bookmarks) ?? [];

  const listRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const lenis = new Lenis({
      wrapper: el,
      content: el,
      duration: 1.1,
      smoothWheel: true,
      syncTouch: true,
    });
    lenisRef.current = lenis;
    const raf = (time: number) => {
      lenis.raf(time);
      rafRef.current = requestAnimationFrame(raf);
    };
    rafRef.current = requestAnimationFrame(raf);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Stagger rows in once per distinct query — not on every background
  // refetch of the same query (e.g. window refocus), which would replay
  // the animation over rows already on screen.
  const lastStaggeredQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (isPending || !bookmarks.length || !listRef.current) return;
    if (lastStaggeredQueryRef.current === searchQuery) return;
    lastStaggeredQueryRef.current = searchQuery;
    const rows = listRef.current.querySelectorAll("[data-mobile-row]");
    if (!rows.length) return;
    gsap.from(rows, {
      y: 18,
      opacity: 0,
      duration: 0.55,
      stagger: 0.07,
      ease: "power3.out",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, bookmarks.length, searchQuery]);

  if (error) throw error;

  return (
    <div className="flex h-full flex-col sm:hidden">
      <div className="flex-none px-[16px] pb-[10px] pt-[10px]">
        <div
          className={cn(
            "border-k-border bg-k-surface-1 flex h-[40px] items-center gap-[9px] rounded-[11px] border px-[13px]",
            inputValue && "border-k-accent",
          )}
        >
          <Search
            size={16}
            className="text-k-accent flex-none"
            strokeWidth={1.9}
          />
          <input
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              debounceSearch(e.target.value);
            }}
            placeholder="Search your queue"
            className="text-k-fg placeholder:text-k-fg-dim min-w-0 flex-1 bg-transparent text-[14px] outline-none"
          />
          {inputValue && (
            <button
              type="button"
              aria-label="Clear search"
              className="text-k-fg-dim flex-none"
              onClick={() => {
                setInputValue("");
                debounceSearch("");
              }}
            >
              <X size={15} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {!isPending && (
        <div className="font-k-mono text-k-fg-dim flex-none px-[16px] pb-[6px] text-[10.5px]">
          {hasQuery
            ? `// ${bookmarks.length} match${bookmarks.length === 1 ? "" : "es"}`
            : `// ${bookmarks.length} in queue`}
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <div className="flex flex-col gap-[6px] px-[18px] pt-[13px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-[6px] pb-[13px]">
                <div className="bg-k-border h-3 w-3/4 rounded-[3px]" />
                <div className="bg-k-border h-2 w-full rounded-[3px]" />
              </div>
            ))}
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="text-k-fg-dim px-[18px] pt-[40px] text-center text-[13px]">
            {hasQuery ? "No matches." : "Nothing in the queue."}
          </div>
        ) : (
          <>
            {bookmarks.map((bookmark) => (
              <div key={bookmark.id} data-mobile-row>
                <DenseBookmarkRow bookmark={bookmark} />
              </div>
            ))}
            {hasNextPage ? (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="font-k-mono text-k-fg-dim w-full py-[16px] text-center text-[10.5px] disabled:opacity-50"
              >
                {isFetchingNextPage ? "// loading…" : "// load more"}
              </button>
            ) : (
              <div className="font-k-mono text-k-fg-dim px-[16px] py-[16px] text-center text-[10.5px]">
                {"// end_of_results"}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
