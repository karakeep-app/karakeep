"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
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

const PREFETCH_DISTANCE_PX = 600;

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

function getBookmarkIcon(bookmark: ZBookmark) {
  switch (bookmark.content.type) {
    case BookmarkTypes.TEXT:
      return <NotebookPen className="size-8 text-muted-foreground" />;
    case BookmarkTypes.ASSET:
      return bookmark.content.assetType === "pdf" ? (
        <FileText className="size-8 text-muted-foreground" />
      ) : (
        <ImageIcon className="size-8 text-muted-foreground" />
      );
    default:
      return <Newspaper className="size-8 text-muted-foreground" />;
  }
}

function SimilarBookmarkCard({
  bookmark,
  href,
  variant,
}: {
  bookmark: ZBookmark;
  href: string;
  variant: "sidebar" | "reader";
}) {
  const title = getBookmarkTitle(bookmark) ?? "Untitled";
  const subtitle = getBookmarkSubtitle(bookmark);
  const image =
    bookmark.content.type === BookmarkTypes.LINK
      ? getBookmarkLinkImageUrl(bookmark.content)
      : null;
  const favicon =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.favicon
      : null;

  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "group flex shrink-0 snap-start flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40 hover:bg-accent",
        variant === "sidebar" ? "w-40" : "w-56",
      )}
    >
      <div
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden bg-muted",
          variant === "sidebar" ? "h-24" : "h-32",
        )}
      >
        {image ? (
          <Image
            alt=""
            src={image.url}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : favicon ? (
          <Image src={favicon} alt="" width={32} height={32} unoptimized />
        ) : (
          getBookmarkIcon(bookmark)
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

export default function SimilarBookmarksBox({
  bookmarkId,
  isOwner,
  variant = "sidebar",
}: {
  bookmarkId: string;
  isOwner: boolean;
  variant?: "sidebar" | "reader";
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Reset the carousel position when navigating to another bookmark.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [bookmarkId]);

  // Load the next batch while the user is still a few cards away from the end,
  // so they never have to wait when they reach the last loaded item.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) {
      return;
    }
    const nearEnd =
      el.scrollLeft + el.clientWidth >= el.scrollWidth - PREFETCH_DISTANCE_PX;
    if (nearEnd) {
      fetchNextPage();
    }
  }, [bookmarks.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (!isOwner || isPending || bookmarks.length === 0) {
    return null;
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    const el = e.currentTarget;
    if (
      el.scrollLeft + el.clientWidth >=
      el.scrollWidth - PREFETCH_DISTANCE_PX
    ) {
      fetchNextPage();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Newspaper className="size-3.5" />
        {t("preview.similar_articles")}
      </p>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
      >
        {bookmarks.map((bookmark) => (
          <SimilarBookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            variant={variant}
            href={
              variant === "reader"
                ? `/reader/${bookmark.id}`
                : `/dashboard/preview/${bookmark.id}`
            }
          />
        ))}
        {isFetchingNextPage && (
          <div className="flex w-16 shrink-0 items-center justify-center">
            <LoadingSpinner className="size-4" />
          </div>
        )}
      </div>
    </div>
  );
}
