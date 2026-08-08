"use client";

import Link from "next/link";
import { FavouritedActionIcon } from "@/components/dashboard/bookmarks/icons";
import {
  getDenseRowSource,
  getDenseRowTitle,
} from "@/lib/dense/bookmarkDisplay";
import { formatCompactRelativeTime } from "@/lib/dense/format";
import { summaryPreview } from "@/lib/dense/summary";
import { useLiveBookmark } from "@/lib/dense/useLiveBookmark";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { DenseRowOverflowMenu } from "./DenseRowOverflowMenu";

/** The grid view (prototype 1b) reachable from the header's view toggle. */
export function DenseBookmarkCard({
  bookmark: initialBookmark,
}: {
  bookmark: ZBookmark;
}) {
  const bookmark = useLiveBookmark(initialBookmark);
  const { mutate: updateBookmark, isPending } = useUpdateBookmark({});

  const title = getDenseRowTitle(bookmark);
  const source = getDenseRowSource(bookmark);
  const isPendingSummary = bookmark.summarizationStatus === "pending";
  const summary = summaryPreview(bookmark.summary);

  return (
    <div className="border-k-border bg-k-surface-1 group relative flex flex-col gap-2 rounded-[12px] border p-[16px_17px]">
      <Link
        href={`/dashboard/preview/${bookmark.id}`}
        className="absolute inset-0 z-0"
        aria-label={title}
      />
      <div className="pointer-events-none relative z-10 flex items-center justify-between">
        <span className="font-k-mono text-k-fg-dim text-[10px] font-medium uppercase tracking-[0.08em]">
          {source ?? "AI title"}
        </span>
        <div className="text-k-icon pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={bookmark.favourited ? "Unfavourite" : "Favourite"}
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              updateBookmark({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              });
            }}
            className="hover:text-k-fg-muted relative z-20 flex items-center justify-center"
          >
            <FavouritedActionIcon
              favourited={bookmark.favourited}
              size={15}
              strokeWidth={1.75}
            />
          </button>
          <div className="relative z-20">
            <DenseRowOverflowMenu bookmark={bookmark} />
          </div>
        </div>
      </div>
      <div className="pointer-events-none relative z-10 flex items-center gap-2">
        {/* Title-led emphasis: card title 17px, weight 650. */}
        <span
          className={cn(
            "line-clamp-2 text-[17px] font-[650] tracking-[-0.015em]",
            isPendingSummary ? "text-k-fg-soft" : "text-k-fg",
          )}
        >
          {title}
        </span>
        {!isPendingSummary && bookmark.summary && (
          <Sparkles size={13} className="text-k-accent flex-none opacity-65" />
        )}
      </div>
      {isPendingSummary ? (
        <div className="pointer-events-none relative z-10 flex flex-col gap-[6px] pt-[2px]">
          <div className="bg-k-border h-2 rounded-[3px]" />
          <div className="bg-k-border h-2 w-[72%] rounded-[3px]" />
        </div>
      ) : summary ? (
        <p className="text-k-summary pointer-events-none relative z-10 line-clamp-3 text-[12px] leading-[1.5]">
          {summary}
        </p>
      ) : null}
      <div className="pointer-events-none relative z-10 mt-auto flex items-center justify-between pt-1">
        <div className="flex flex-wrap gap-[5px]">
          {bookmark.tags.slice(0, 2).map((tag) => (
            <Link
              key={tag.id}
              href={`/dashboard/tags/${tag.id}`}
              className="border-k-border text-k-fg-muted hover:border-k-accent-border hover:text-k-fg pointer-events-auto relative z-20 rounded-full border px-[7px] py-px text-[10.5px]"
            >
              {tag.name}
            </Link>
          ))}
        </div>
        <span className="font-k-mono text-k-timestamp text-[11px]">
          {formatCompactRelativeTime(bookmark.createdAt)}
        </span>
      </div>
    </div>
  );
}
