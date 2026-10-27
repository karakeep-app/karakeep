"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FileText, ImageIcon, Newspaper, NotebookPen } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkLinkImageUrl,
  getBookmarkTitle,
  getSourceUrl,
} from "@karakeep/shared/utils/bookmarkUtils";

// Number of rows shown in the collapsed details-column list.
const DEFAULT_VISIBLE_ROWS = 4;
// Height of the folded grid on the full reader page (roughly two card rows).
const GRID_FOLDED_MAX_HEIGHT = "max-h-[30rem]";

function getHostname(url: string | null | undefined) {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getBookmarkSubtitle(bookmark: ZBookmark) {
  const sourceUrl = getSourceUrl(bookmark);
  const hostname = getHostname(sourceUrl);
  if (hostname) {
    return hostname;
  }
  switch (bookmark.content.type) {
    case BookmarkTypes.TEXT:
      return null;
    case BookmarkTypes.ASSET:
      return bookmark.content.fileName ?? bookmark.content.assetType;
    default:
      return null;
  }
}

function getBookmarkIcon(bookmark: ZBookmark, className?: string) {
  switch (bookmark.content.type) {
    case BookmarkTypes.TEXT:
      return <NotebookPen className={cn("text-muted-foreground", className)} />;
    case BookmarkTypes.ASSET:
      return bookmark.content.assetType === "pdf" ? (
        <FileText className={cn("text-muted-foreground", className)} />
      ) : (
        <ImageIcon className={cn("text-muted-foreground", className)} />
      );
    default:
      return <Newspaper className={cn("text-muted-foreground", className)} />;
  }
}

/**
 * Thumbnail shared by both layouts. Sized by the caller; the list variant uses
 * a thumbnail as tall as two lines of title text (h-10).
 */
function SimilarBookmarkThumb({
  bookmark,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const image =
    bookmark.content.type === BookmarkTypes.LINK
      ? getBookmarkLinkImageUrl(bookmark.content)
      : null;
  const favicon =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.favicon
      : null;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted",
        className,
      )}
    >
      {image ? (
        <Image
          alt=""
          src={image.url}
          fill
          unoptimized
          className="object-cover"
        />
      ) : favicon ? (
        <Image src={favicon} alt="" width={20} height={20} unoptimized />
      ) : (
        getBookmarkIcon(bookmark, "size-5")
      )}
    </div>
  );
}

/**
 * Compact row used in the details column: a thumbnail roughly as tall as two
 * lines of text, with the bookmark title rendered next to it.
 */
function SimilarBookmarkRow({
  bookmark,
  href,
}: {
  bookmark: ZBookmark;
  href: string;
}) {
  const title = getBookmarkTitle(bookmark) ?? "Untitled";
  return (
    <Link
      href={href}
      replace
      prefetch={false}
      className="group flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-accent"
    >
      <SimilarBookmarkThumb bookmark={bookmark} className="h-10 w-14" />
      <span className="line-clamp-2 min-w-0 text-sm font-medium leading-snug">
        {title}
      </span>
    </Link>
  );
}

/**
 * Card used in the full-width grid on the reader page.
 */
function SimilarBookmarkCard({
  bookmark,
  href,
}: {
  bookmark: ZBookmark;
  href: string;
}) {
  const title = getBookmarkTitle(bookmark) ?? "Untitled";
  const subtitle = getBookmarkSubtitle(bookmark);

  return (
    <Link
      href={href}
      replace
      prefetch={false}
      className="group flex w-full flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <div className="relative flex h-32 w-full items-center justify-center overflow-hidden bg-muted">
        {bookmark.content.type === BookmarkTypes.LINK &&
        getBookmarkLinkImageUrl(bookmark.content) ? (
          <Image
            alt=""
            src={getBookmarkLinkImageUrl(bookmark.content)!.url}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : bookmark.content.type === BookmarkTypes.LINK &&
          bookmark.content.favicon ? (
          <Image
            src={bookmark.content.favicon}
            alt=""
            width={32}
            height={32}
            unoptimized
          />
        ) : (
          getBookmarkIcon(bookmark, "size-8")
        )}
      </div>
      <div className="flex flex-col gap-1 p-2">
        <span className="line-clamp-2 text-sm font-medium leading-snug">
          {title}
        </span>
        {subtitle && (
          <span className="truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * Similar-articles box.
 *
 * - `list` (default): compact vertical list for the preview's details column,
 *   showing a few rows with a "Show all" expander. Always used unless the
 *   bookmark is open full screen in the reader.
 * - `grid`: responsive full-width grid at the end of the full reader page,
 *   folded after roughly two rows with a "Show more" expander.
 */
export default function SimilarBookmarksBox({
  bookmarkId,
  isOwner,
  variant = "list",
}: {
  bookmarkId: string;
  isOwner: boolean;
  variant?: "list" | "grid";
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const gridRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [gridOverflows, setGridOverflows] = useState(false);

  const { data, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery(
      api.bookmarks.getSimilarBookmarks.infiniteQueryOptions(
        { bookmarkId },
        {
          initialCursor: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
          enabled: isOwner,
          staleTime: 5 * 60 * 1000,
        },
      ),
    );

  const bookmarks = useMemo(
    () => data?.pages.flatMap((page) => page.bookmarks) ?? [],
    [data],
  );

  // Collapse again when navigating to another bookmark.
  useEffect(() => {
    setExpanded(false);
  }, [bookmarkId]);

  // While expanded, keep paging until everything is loaded.
  useEffect(() => {
    if (expanded && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [expanded, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Detect whether the folded grid actually hides content at this viewport.
  useEffect(() => {
    if (variant !== "grid" || expanded) {
      return;
    }
    const el = gridRef.current;
    if (!el) {
      return;
    }
    setGridOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [variant, expanded, bookmarks.length]);

  if (!isOwner || isPending || bookmarks.length === 0) {
    return null;
  }

  const visibleBookmarks =
    variant === "list" && !expanded
      ? bookmarks.slice(0, DEFAULT_VISIBLE_ROWS)
      : bookmarks;
  const canExpand =
    hasNextPage ||
    (variant === "list"
      ? bookmarks.length > DEFAULT_VISIBLE_ROWS
      : gridOverflows);
  const hrefFor = (id: string) =>
    variant === "grid" ? `/reader/${id}` : `/dashboard/preview/${id}`;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Newspaper className="size-3.5" />
        {t("preview.similar_articles")}
      </p>
      {variant === "list" ? (
        <div className="flex flex-col gap-0.5">
          {visibleBookmarks.map((bookmark) => (
            <SimilarBookmarkRow
              key={bookmark.id}
              bookmark={bookmark}
              href={hrefFor(bookmark.id)}
            />
          ))}
        </div>
      ) : (
        <div
          ref={gridRef}
          className={cn(
            "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
            !expanded && GRID_FOLDED_MAX_HEIGHT,
            !expanded && "overflow-hidden",
          )}
        >
          {visibleBookmarks.map((bookmark) => (
            <SimilarBookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              href={hrefFor(bookmark.id)}
            />
          ))}
        </div>
      )}
      {!expanded && canExpand && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setExpanded(true)}
        >
          {t("preview.similar_articles_show_all")}
        </Button>
      )}
      {expanded && isFetchingNextPage && (
        <div className="flex items-center justify-center py-2">
          <LoadingSpinner className="size-4" />
        </div>
      )}
      {expanded && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setExpanded(false)}
        >
          {t("preview.similar_articles_show_less")}
        </Button>
      )}
    </div>
  );
}
