"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useInView } from "react-intersection-observer";

import type {
  ZGetBookmarksRequest,
  ZGetBookmarksResponse,
} from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";

import { DenseBookmarkCard } from "./DenseBookmarkCard";
import { DenseBookmarkRow } from "./DenseBookmarkRow";
import { QuickAddDialog } from "./QuickAddDialog";

const VIEW_KEY = "k-dense-files-view";

function useFilesView() {
  const [view, setView] = useState<"list" | "grid">("list");
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored === "list" || stored === "grid") {
      setView(stored);
    }
  }, []);
  const update = (next: "list" | "grid") => {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  };
  return { view, setView: update };
}

export default function DenseFilesView({
  label,
  query,
  initialBookmarks,
}: {
  label: string;
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">;
  initialBookmarks: ZGetBookmarksResponse;
}) {
  const api = useTRPC();
  const { view, setView } = useFilesView();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const sortOrder = useSortOrderStore((state) => state.sortOrder);
  const setSortOrder = useSortOrderStore((state) => state.setSortOrder);
  const resolvedSortOrder = sortOrder === "relevance" ? "desc" : sortOrder;

  const finalQuery = {
    ...query,
    sortOrder: resolvedSortOrder,
    includeContent: false,
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useInfiniteQuery(
      api.bookmarks.getBookmarks.infiniteQueryOptions(
        { ...finalQuery, useCursorV2: true },
        {
          initialData: () => ({
            pages: [initialBookmarks],
            pageParams: [query.cursor ?? null],
          }),
          initialCursor: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
          refetchOnMount: true,
        },
      ),
    );

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSortOrder]);

  const bookmarks = useMemo(
    () => data.pages.flatMap((p) => p.bookmarks),
    [data],
  );

  const { ref: loadMoreRef, inView } = useInView();
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const unsummarisedCount = bookmarks.filter(
    (b) => b.summarizationStatus !== "success",
  ).length;
  const mostRecentModified = bookmarks.reduce<Date | null>((acc, b) => {
    const candidate = b.modifiedAt ?? b.createdAt;
    if (!acc || candidate > acc) return candidate;
    return acc;
  }, null);

  return (
    // Negative margin cancels the dashboard shell's default p-4 so the
    // header/row padding below lines up with the design's own spacing
    // instead of stacking on top of it.
    <div className="-m-4 flex flex-col">
      {/* Capped so rows/cards don't stretch edge-to-edge into empty space
          on wide monitors — "fluid" per the design doc means it adapts to
          the window, not that it has no limit at all. */}
      <div className="flex w-full max-w-[1600px] flex-col">
        <div className="flex items-center gap-[14px] px-[22px] pb-[12px] pt-[15px]">
          <div className="flex flex-col gap-[3px]">
            <h1 className="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#ddd9d4]">
              {label}
            </h1>
            <p className="font-k-mono text-k-fg-dim text-[11.5px]">
              {bookmarks.length} item{bookmarks.length === 1 ? "" : "s"} ·{" "}
              {unsummarisedCount} unsummarised
              {mostRecentModified && (
                <> · updated {relativeShort(mostRecentModified)}</>
              )}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-[10px]">
            <Link
              href="/dashboard/search"
              className="border-k-border bg-k-bg text-k-fg-dim hover:text-k-fg-muted flex items-center gap-2 rounded-[9px] border px-[12px] py-[5px] text-[12.5px]"
            >
              <Search size={15} strokeWidth={1.75} />
              Search
              <kbd className="font-k-mono text-k-fg-dim ml-1 text-[10px]">
                ⌘K
              </kbd>
            </Link>
            <button
              type="button"
              aria-label="Add bookmark"
              onClick={() => setQuickAddOpen(true)}
              className="border-k-border bg-k-bg text-k-fg-muted hover:text-k-fg flex size-[22px] items-center justify-center rounded-[8px] border"
            >
              <Plus size={20} strokeWidth={1.75} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Sort"
                  className="border-k-border bg-k-bg text-k-fg-muted hover:text-k-fg flex size-[22px] items-center justify-center rounded-[8px] border"
                >
                  <SlidersHorizontal size={20} strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-k-border bg-k-surface-1 text-k-fg"
              >
                <DropdownMenuItem onClick={() => setSortOrder("desc")}>
                  <ArrowDownAZ className="mr-2 size-4" />
                  Newest first
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder("asc")}>
                  <ArrowUpAZ className="mr-2 size-4" />
                  Oldest first
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="border-k-border bg-k-bg flex items-center gap-[3px] rounded-[8px] border p-[3px]">
              <button
                type="button"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                className={
                  view === "list"
                    ? "bg-k-accent text-k-bg flex size-[18px] items-center justify-center rounded-[5px]"
                    : "text-k-fg-muted flex size-[18px] items-center justify-center"
                }
              >
                <ListIcon size={13} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                className={
                  view === "grid"
                    ? "bg-k-accent text-k-bg flex size-[18px] items-center justify-center rounded-[5px]"
                    : "text-k-fg-muted flex size-[18px] items-center justify-center"
                }
              >
                <LayoutGrid size={13} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {bookmarks.length === 0 ? (
          <div className="text-k-fg-dim flex flex-1 items-center justify-center text-[13px]">
            Nothing here yet.
          </div>
        ) : view === "list" ? (
          <div className="flex flex-1 flex-col overflow-y-auto">
            {bookmarks.map((bookmark) => (
              <DenseBookmarkRow key={bookmark.id} bookmark={bookmark} />
            ))}
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-[14px] overflow-y-auto px-[18px] pb-[18px] sm:grid-cols-2">
            {bookmarks.map((bookmark) => (
              <DenseBookmarkCard key={bookmark.id} bookmark={bookmark} />
            ))}
          </div>
        )}

        {hasNextPage && (
          <div ref={loadMoreRef} className="py-4 text-center">
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="font-k-mono text-k-fg-dim hover:text-k-fg-muted text-[11px]"
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}

function relativeShort(date: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
