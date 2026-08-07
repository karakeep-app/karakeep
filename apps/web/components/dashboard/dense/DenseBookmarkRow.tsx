"use client";

import Link from "next/link";
import { FavouritedActionIcon } from "@/components/dashboard/bookmarks/icons";
import {
  estimateReadingTimeMinutes,
  formatCompactRelativeTime,
} from "@/lib/dense/format";
import {
  getDenseRowSource,
  getDenseRowTitle,
} from "@/lib/dense/bookmarkDisplay";
import { useLiveBookmark } from "@/lib/dense/useLiveBookmark";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { DenseRowOverflowMenu } from "./DenseRowOverflowMenu";

export function DenseBookmarkRow({
  bookmark: initialBookmark,
  selected,
}: {
  bookmark: ZBookmark;
  selected?: boolean;
}) {
  const bookmark = useLiveBookmark(initialBookmark);
  const { mutate: updateBookmark, isPending } = useUpdateBookmark({});

  const title = getDenseRowTitle(bookmark);
  const source = getDenseRowSource(bookmark);
  const isPendingSummary = bookmark.summarizationStatus === "pending";
  const isSummarised =
    bookmark.summarizationStatus === "success" && !!bookmark.summary;
  const readingMinutes = estimateReadingTimeMinutes(bookmark.summary);

  return (
    <div
      className={cn(
        "border-k-border-soft group relative flex gap-[14px] border-t px-[18px] py-[14px]",
        selected ? "bg-k-surface-1" : "hover:bg-k-surface-1/60",
      )}
    >
      <Link
        href={`/dashboard/preview/${bookmark.id}`}
        className="absolute inset-0 z-0"
        aria-label={title}
      />

      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-[6px]">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[14px] font-[550] tracking-[-0.01em]",
              isPendingSummary ? "text-k-fg-soft" : "text-k-fg",
            )}
          >
            {title}
          </span>
          {isPendingSummary ? (
            <span className="border-k-border font-k-mono text-k-fg-dim flex flex-none items-center gap-[4px] rounded border px-[5px] py-[1px] text-[9.5px] font-medium uppercase tracking-[0.06em]">
              <span className="bg-k-fg-dim size-1 rounded-full" />
              Summarising
            </span>
          ) : isSummarised ? (
            <Sparkles
              size={13}
              className="text-k-accent flex-none opacity-65"
              aria-label="AI summarised"
            />
          ) : null}
        </div>

        {isPendingSummary ? (
          <div className="flex flex-col gap-[6px] py-[2px]">
            <div className="bg-k-skeleton h-2 max-w-[640px] rounded-[3px]" />
            <div className="bg-k-skeleton h-2 w-[72%] max-w-[640px] rounded-[3px]" />
          </div>
        ) : bookmark.summary ? (
          <p className="text-k-fg-muted line-clamp-2 max-w-[640px] text-[12.5px] leading-[1.55] [text-wrap:pretty]">
            {bookmark.summary}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-[10px] pt-[2px]">
          {source && (
            <span className="font-k-mono text-k-fg-dim text-[11px]">
              {source}
            </span>
          )}
          {!isPendingSummary && readingMinutes && (
            <>
              {source && <span className="text-[#3a3b3e]">·</span>}
              <span className="font-k-mono text-k-fg-dim text-[11px]">
                {readingMinutes} min
              </span>
            </>
          )}
          {bookmark.tags.slice(0, 3).map((tag) => (
            <Link
              key={tag.id}
              href={`/dashboard/tags/${tag.id}`}
              className="border-k-border text-k-fg-muted hover:border-k-accent-border hover:text-k-fg pointer-events-auto relative z-20 rounded-full border px-[7px] py-[1px] text-[10.5px]"
            >
              {tag.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex flex-none flex-col items-end gap-[10px]">
        <span className="font-k-mono text-k-timestamp text-[11px]">
          {formatCompactRelativeTime(bookmark.createdAt)}
        </span>
        <div className="flex items-center gap-[10px]">
          <button
            type="button"
            aria-label={bookmark.favourited ? "Unfavourite" : "Favourite"}
            aria-pressed={bookmark.favourited}
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              updateBookmark({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              });
            }}
            className="text-k-fg-dim hover:text-k-fg-muted pointer-events-auto relative z-20 flex size-[15px] items-center justify-center"
          >
            <FavouritedActionIcon
              favourited={bookmark.favourited}
              size={15}
              strokeWidth={1.75}
            />
          </button>
          <div className="pointer-events-auto relative z-20">
            <DenseRowOverflowMenu bookmark={bookmark} />
          </div>
        </div>
      </div>
    </div>
  );
}
