"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { cn } from "@/lib/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  LayoutGrid,
  List as ListIcon,
  Maximize2,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { useInView } from "react-intersection-observer";

import type {
  ZGetBookmarksRequest,
  ZGetBookmarksResponse,
} from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";

import { DenseBookmarkCard } from "./DenseBookmarkCard";
import { DenseBookmarkRow } from "./DenseBookmarkRow";
import { useDenseScaleContext } from "./DenseScaleController";
import { QuickAddDialog } from "./QuickAddDialog";

const VIEW_KEY = "k-dense-files-view";

/**
 * Shared shell for every control in the FILES header. The prototype drew
 * these at differing heights (22px buttons next to a taller search pill);
 * unifying them on the pill's height reads considerably tidier, so this is
 * a deliberate, reviewed departure from the mockup.
 */
const CONTROL_SHELL =
  "border-k-border bg-k-surface-1 text-k-fg-muted flex h-[28px] flex-none items-center justify-center rounded-[8px] border";

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
  searchEnabled = false,
}: {
  label: string;
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">;
  initialBookmarks: ZGetBookmarksResponse;
  searchEnabled?: boolean;
}) {
  const router = useRouter();
  const api = useTRPC();
  const { view, setView } = useFilesView();
  const { scale, preference, setPreference } = useDenseScaleContext();
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

  // The pill advertises ⌘K, so make it real — but only when search is
  // actually available, otherwise the shortcut would just crash the page.
  useEffect(() => {
    if (!searchEnabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/dashboard/search");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchEnabled, router]);

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
      <div className="flex w-full max-w-[1400px] flex-col">
        <div className="flex items-center gap-[14px] px-[22px] pb-[12px] pt-[15px]">
          <div className="flex flex-col gap-[3px]">
            <h1 className="text-k-section-label text-[15px] font-semibold uppercase tracking-[0.06em]">
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
            {searchEnabled ? (
              <Link
                href="/dashboard/search"
                className={cn(CONTROL_SHELL, "gap-2 px-[12px] text-[12.5px]")}
              >
                <Search size={15} strokeWidth={1.75} />
                Search
                <kbd className="font-k-mono text-k-fg-dim ml-1 text-[10px]">
                  ⌘K
                </kbd>
              </Link>
            ) : (
              <span
                title="Search needs a search backend configured on the server (see Karakeep's search configuration docs)."
                aria-disabled="true"
                className={cn(
                  CONTROL_SHELL,
                  "text-k-fg-dim/50 cursor-not-allowed gap-2 px-[12px] text-[12.5px]",
                )}
              >
                <Search size={15} strokeWidth={1.75} />
                Search
              </span>
            )}
            <button
              type="button"
              aria-label="Add bookmark"
              onClick={() => setQuickAddOpen(true)}
              className={cn(CONTROL_SHELL, "hover:text-k-fg w-[28px]")}
            >
              <Upload size={15} strokeWidth={1.75} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="View options"
                  className={cn(CONTROL_SHELL, "hover:text-k-fg w-[28px]")}
                >
                  <SlidersHorizontal size={15} strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-k-border bg-k-surface-1 text-k-fg"
              >
                <DropdownMenuLabel>Sort</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setSortOrder("desc")}>
                  <ArrowDownAZ className="mr-2 size-4" />
                  Newest first
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder("asc")}>
                  <ArrowUpAZ className="mr-2 size-4" />
                  Oldest first
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>
                  Scale
                  <span className="text-k-fg-dim ml-2 font-normal">
                    {preference === "auto"
                      ? `Auto · ${Math.round(scale * 100)}%`
                      : `${Math.round(scale * 100)}%`}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setPreference("auto")}
                  disabled={preference === "auto"}
                >
                  <Maximize2 className="mr-2 size-4" />
                  Fit to display
                </DropdownMenuItem>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    type="button"
                    aria-label="Decrease scale"
                    onClick={() =>
                      setPreference(
                        Math.round(Math.max(0.85, scale - 0.1) * 100) / 100,
                      )
                    }
                    className="border-k-border text-k-fg-muted hover:text-k-fg flex size-6 items-center justify-center rounded border"
                  >
                    <Minus className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="Increase scale"
                    onClick={() =>
                      setPreference(
                        Math.round(Math.min(2.5, scale + 0.1) * 100) / 100,
                      )
                    }
                    className="border-k-border text-k-fg-muted hover:text-k-fg flex size-6 items-center justify-center rounded border"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Segmented view toggle. Same shell height as every other
                header control; the active glyph sits on an accent chip. */}
            <div className={cn(CONTROL_SHELL, "gap-[2px] p-[3px]")}>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                className={cn(
                  "flex size-[20px] items-center justify-center rounded-[5px]",
                  view === "list"
                    ? "bg-k-accent text-k-accent-fg"
                    : "text-k-fg-muted",
                )}
              >
                <ListIcon size={13} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                className={cn(
                  "flex size-[20px] items-center justify-center rounded-[5px]",
                  view === "grid"
                    ? "bg-k-accent text-k-accent-fg"
                    : "text-k-fg-muted",
                )}
              >
                <LayoutGrid size={13} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {bookmarks.length === 0 ? (
          <div className="text-k-fg-dim flex flex-1 items-center justify-center py-24 text-[12.5px]">
            Nothing here yet.
          </div>
        ) : view === "list" ? (
          <div className="flex flex-1 flex-col">
            {bookmarks.map((bookmark, i) => (
              <DenseBookmarkRow
                key={bookmark.id}
                bookmark={bookmark}
                selected={i === 0}
              />
            ))}
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-[14px] px-[18px] pb-[18px] sm:grid-cols-2">
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
