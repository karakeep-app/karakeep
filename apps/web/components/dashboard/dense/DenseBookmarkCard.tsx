"use client";

import Link from "next/link";
import { FavouritedActionIcon } from "@/components/dashboard/bookmarks/icons";
import {
  getDenseRowSource,
  getDenseRowTitle,
} from "@/lib/dense/bookmarkDisplay";
import { formatCompactRelativeTime } from "@/lib/dense/format";
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

  return (
    <div className="border-k-border bg-k-surface-1 group relative flex flex-col gap-3 rounded-[18px] border p-[24px_26px]">
      <Link
        href={`/dashboard/preview/${bookmark.id}`}
        className="absolute inset-0 z-0"
        aria-label={title}
      />
      <div className="pointer-events-none relative z-10 flex items-center justify-between">
        <span className="font-k-mono text-k-fg-dim text-[15px] font-medium uppercase tracking-[0.08em]">
          {source ?? "AI TITLE"}
        </span>
        <div className="pointer-events-auto flex items-center gap-3">
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
            className="text-k-fg-dim hover:text-k-fg-muted relative z-20 flex size-[22px] items-center justify-center"
          >
            <FavouritedActionIcon
              favourited={bookmark.favourited}
              size={22}
              strokeWidth={1.75}
            />
          </button>
          <div className="relative z-20">
            <DenseRowOverflowMenu bookmark={bookmark} />
          </div>
        </div>
      </div>
      <div className="pointer-events-none relative z-10 flex items-center gap-3">
        <span
          className={cn(
            "line-clamp-2 text-[26px] font-semibold tracking-[-0.02em]",
            isPendingSummary ? "text-k-fg-soft" : "text-k-fg",
          )}
        >
          {title}
        </span>
        {!isPendingSummary && bookmark.summary && (
          <Sparkles size={20} className="text-k-accent flex-none opacity-65" />
        )}
      </div>
      {isPendingSummary ? (
        <div className="pointer-events-none relative z-10 flex flex-col gap-[9px] py-[3px]">
          <div className="bg-k-skeleton h-3 rounded-[5px]" />
          <div className="bg-k-skeleton h-3 w-[72%] rounded-[5px]" />
        </div>
      ) : bookmark.summary ? (
        <p className="text-k-summary pointer-events-none relative z-10 line-clamp-3 text-[18px] leading-[1.5]">
          {bookmark.summary}
        </p>
      ) : null}
      <div className="pointer-events-none relative z-10 mt-auto flex items-center justify-between pt-2">
        <div className="flex flex-wrap gap-2">
          {bookmark.tags.slice(0, 2).map((tag) => (
            <Link
              key={tag.id}
              href={`/dashboard/tags/${tag.id}`}
              className="border-k-border text-k-fg-muted hover:border-k-accent-border hover:text-k-fg pointer-events-auto relative z-20 rounded-full border px-[10px] py-[2px] text-[16px]"
            >
              {tag.name}
            </Link>
          ))}
        </div>
        <span className="font-k-mono text-k-timestamp text-[17px]">
          {formatCompactRelativeTime(bookmark.createdAt)}
        </span>
      </div>
    </div>
  );
}
