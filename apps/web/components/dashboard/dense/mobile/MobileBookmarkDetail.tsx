"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArchivedActionIcon,
  FavouritedActionIcon,
} from "@/components/dashboard/bookmarks/icons";
import { DenseRowOverflowMenu } from "@/components/dashboard/dense/DenseRowOverflowMenu";
import { AssetContentSection } from "@/components/dashboard/preview/AssetContentSection";
import AttachmentBox from "@/components/dashboard/preview/AttachmentBox";
import HighlightsBox from "@/components/dashboard/preview/HighlightsBox";
import LinkContentSection from "@/components/dashboard/preview/LinkContentSection";
import { NoteEditor } from "@/components/dashboard/preview/NoteEditor";
import { TextContentSection } from "@/components/dashboard/preview/TextContentSection";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { useSession } from "@/lib/auth/client";
import { getDenseRowTitle } from "@/lib/dense/bookmarkDisplay";
import {
  estimateReadingTimeMinutes,
  formatSavedAgo,
  getDomainFromUrl,
} from "@/lib/dense/format";
import { parseSummary } from "@/lib/dense/summary";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { gsap } from "gsap";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkRefreshInterval,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

const SECTION_LABEL =
  "font-k-mono text-k-fg-dim text-[10px] font-medium uppercase tracking-[0.08em]";

/**
 * The mobile read() detail (design/Keepsake Mobile Designs.html, screen
 * 2c) — a full-screen takeover rather than the desktop's dialog/split-pane,
 * rendered from both the hard-nav preview route and the intercepted modal
 * route (see those two page.tsx files for the `sm:hidden` pairing with
 * their desktop counterparts).
 *
 * Two GSAP behaviours are lifted verbatim from the design's own component
 * source rather than re-derived from the screenshot: the hairline progress
 * rule at the very top fills as `readRef` scrolls (`scrollTop / max`
 * animated with `gsap.to(bar, { width })`), and the title does a
 * react-bits-style word-by-word split reveal on mount. Both read the exact
 * easing/timing the design author wrote (`power2.out` / `power4.out`,
 * `.35s` / `.7s` + `.04s` stagger).
 *
 * Deliberate differences from the mockup, all reusing existing pieces
 * rather than building new ones:
 * - The design's flowing prose paragraphs below the summary card read like
 *   placeholder article text rather than real AI summary output — Karakeep
 *   has one summary field, already fully accounted for by `parseSummary`'s
 *   lead/keyPoints/trail. The original page content itself is Karakeep's
 *   heavy renderer-select UI (reader view, screenshot, PDF, archived-page
 *   iframe), which desktop's `DenseBookmarkDetail` already chose to keep
 *   behind a collapsed "Saved page" disclosure rather than inline — this
 *   follows the same precedent for the same reason, not a new decision.
 * - The design's "// related" block has no backend behind it (no
 *   similar-bookmarks endpoint) — dropped rather than faked.
 * - The mockup's star/archive-box/⋯ header trio maps onto real actions:
 *   favourite and archive toggle directly (matching desktop's icon
 *   buttons), and ⋯ is the existing `DenseRowOverflowMenu` (open original,
 *   archive, edit tags, re-summarise, delete) rather than a new menu.
 */
export function MobileBookmarkDetail({
  bookmarkId,
  initialData,
  onBack,
}: {
  bookmarkId: string;
  initialData?: ZBookmark;
  /** Defaults to `router.back()` — only the intercepted modal route needs
   *  to override this (it also has to flip the dialog-open state before
   *  navigating back). */
  onBack?: () => void;
}) {
  const api = useTRPC();
  const router = useRouter();
  const { data: session } = useSession();
  const [contentOpen, setContentOpen] = useState(false);
  const handleBack = onBack ?? (() => router.back());

  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      { bookmarkId },
      {
        initialData,
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) return false;
          return getBookmarkRefreshInterval(data);
        },
      },
    ),
  );

  const { mutate: updateBookmark, isPending: isUpdating } = useUpdateBookmark({
    onError: () => toast.error("Something went wrong"),
  });

  const readRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const title = bookmark ? getDenseRowTitle(bookmark) : null;

  // Scroll-linked progress rule — design's own onScroll/gsap.to, verbatim.
  useEffect(() => {
    const read = readRef.current;
    const bar = progressRef.current;
    if (!read || !bar || !bookmark) return;
    const onScroll = () => {
      const max = read.scrollHeight - read.clientHeight;
      const p = max > 0 ? read.scrollTop / max : 0;
      gsap.to(bar, {
        width: `${8 + p * 92}%`,
        duration: 0.35,
        ease: "power2.out",
        overwrite: true,
      });
    };
    read.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => read.removeEventListener("scroll", onScroll);
  }, [bookmark]);

  // Word-by-word split-text reveal — design's own reveal, verbatim. Runs
  // whenever the title text itself changes (id or re-summarised title),
  // not on every render: unrelated re-renders with the same string leave
  // the JSX-rendered text child alone, so there's nothing to re-split.
  useEffect(() => {
    const t = titleRef.current;
    if (!t || !title) return;
    t.textContent = "";
    const words = title.split(" ");
    words.forEach((w, i) => {
      const outer = document.createElement("span");
      outer.style.cssText =
        "display:inline-block;overflow:hidden;vertical-align:top";
      const inner = document.createElement("span");
      inner.style.display = "inline-block";
      inner.textContent = w + (i < words.length - 1 ? " " : "");
      outer.appendChild(inner);
      t.appendChild(outer);
    });
    gsap.from(t.querySelectorAll("span > span"), {
      yPercent: 110,
      duration: 0.7,
      stagger: 0.04,
      ease: "power4.out",
    });
  }, [title]);

  if (!bookmark) {
    return (
      <div className="bg-k-bg fixed inset-0 z-40 flex flex-col sm:hidden">
        <FullPageSpinner />
      </div>
    );
  }

  const isOwner = session?.user?.id === bookmark.userId;
  const sourceUrl = getSourceUrl(bookmark);
  const domain = sourceUrl ? getDomainFromUrl(sourceUrl) : null;
  const isPendingSummary = bookmark.summarizationStatus === "pending";
  const { lead, keyPoints, trail } = parseSummary(bookmark.summary);
  const readingMinutes = estimateReadingTimeMinutes(bookmark.summary);

  let content;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      content = <LinkContentSection bookmark={bookmark} />;
      break;
    case BookmarkTypes.TEXT:
      content = <TextContentSection bookmark={bookmark} />;
      break;
    case BookmarkTypes.ASSET:
      content = <AssetContentSection bookmark={bookmark} />;
      break;
  }

  return (
    <div className="bg-k-bg fixed inset-0 z-40 flex flex-col sm:hidden">
      <div className="bg-k-border h-[2px] flex-none">
        <div
          ref={progressRef}
          className="bg-k-accent h-full"
          style={{ width: "8%" }}
        />
      </div>

      <div className="flex flex-none items-center gap-[12px] px-[16px] pb-[10px] pt-[14px]">
        <button
          type="button"
          aria-label="Back"
          onClick={handleBack}
          className="text-k-fg-muted flex-none"
        >
          <ArrowLeft size={20} strokeWidth={1.8} />
        </button>
        {domain && (
          <span className="font-k-mono text-k-fg-dim min-w-0 truncate text-[10.5px]">
            {domain}
          </span>
        )}
        <div className="ml-auto flex flex-none items-center gap-[15px]">
          <button
            type="button"
            aria-label={bookmark.favourited ? "Unfavourite" : "Favourite"}
            aria-pressed={bookmark.favourited}
            disabled={!isOwner || isUpdating}
            onClick={() =>
              updateBookmark({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              })
            }
            className="text-k-fg-muted disabled:opacity-50"
          >
            <FavouritedActionIcon
              favourited={bookmark.favourited}
              size={19}
              strokeWidth={1.7}
            />
          </button>
          <button
            type="button"
            aria-label={bookmark.archived ? "Unarchive" : "Archive"}
            aria-pressed={bookmark.archived}
            disabled={!isOwner || isUpdating}
            onClick={() =>
              updateBookmark({
                bookmarkId: bookmark.id,
                archived: !bookmark.archived,
              })
            }
            className="text-k-fg-muted disabled:opacity-50"
          >
            <ArchivedActionIcon
              archived={bookmark.archived}
              size={19}
              strokeWidth={1.7}
            />
          </button>
          {isOwner && <DenseRowOverflowMenu bookmark={bookmark} />}
        </div>
      </div>

      <div
        ref={readRef}
        className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-[24px] pt-[4px]"
      >
        <h1
          ref={titleRef}
          className="text-k-fg text-[24px] font-semibold leading-[1.22] tracking-[-0.025em] [text-wrap:pretty]"
        >
          {title}
        </h1>

        <div className="flex flex-wrap items-center gap-[9px] py-[12px] pb-[16px]">
          <span className="font-k-mono text-k-fg-dim text-[11px]">
            {formatSavedAgo(bookmark.createdAt)}
          </span>
          {readingMinutes && (
            <>
              <span className="text-k-border">·</span>
              <span className="font-k-mono text-k-fg-dim text-[11px]">
                {readingMinutes} min read
              </span>
            </>
          )}
          {bookmark.tags.map((tag) => (
            <span
              key={tag.id}
              className="text-k-fg-muted border-k-border rounded-full border px-[8px] py-[1px] text-[10.5px]"
            >
              {tag.name}
            </span>
          ))}
        </div>

        <div className="border-k-border bg-k-surface-1 flex flex-col gap-[10px] rounded-[13px] border p-[15px]">
          <span className="font-k-mono text-k-accent text-[10px] tracking-[0.08em]">
            {"// summary"}
          </span>
          {isPendingSummary ? (
            <div className="flex flex-col gap-[6px]">
              <div className="bg-k-border h-2 rounded-[3px]" />
              <div className="bg-k-border h-2 rounded-[3px]" />
              <div className="bg-k-border h-2 w-[72%] rounded-[3px]" />
            </div>
          ) : lead ? (
            <p className="text-k-summary-strong text-[13.5px] leading-[1.65] [text-wrap:pretty]">
              {lead}
            </p>
          ) : (
            <p className="text-k-fg-dim text-[13.5px] leading-[1.65]">
              No summary yet.
            </p>
          )}
          {keyPoints.length > 0 && (
            <div className="flex flex-col gap-[7px] pt-[2px]">
              {keyPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-[9px]">
                  <span className="font-k-mono text-k-fg-dim pt-[3px] text-[10px]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-k-fg-muted text-[12.5px] leading-[1.55]">
                    {point}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {trail && (
          <p className="text-k-summary-strong pt-[18px] text-[14.5px] leading-[1.72] [text-wrap:pretty]">
            {trail}
          </p>
        )}

        <div className="border-k-border mt-[18px] flex flex-col gap-[9px] border-t pt-[16px]">
          <p className={SECTION_LABEL}>Note</p>
          <NoteEditor
            bookmark={bookmark}
            disabled={!isOwner}
            className="border-k-border bg-k-surface-2 text-k-fg-muted placeholder:text-k-fg-dim min-h-[4.5rem] rounded-[8px] text-[13px] leading-[1.5]"
          />
        </div>

        <div className="mt-[18px] flex flex-col gap-[18px]">
          <AttachmentBox bookmark={bookmark} readOnly={!isOwner} />
          <HighlightsBox bookmarkId={bookmark.id} readOnly={!isOwner} />
        </div>

        <div className="border-k-border mt-[18px] border-t">
          <button
            type="button"
            aria-expanded={contentOpen}
            onClick={() => setContentOpen((open) => !open)}
            className="font-k-mono text-k-fg-dim flex w-full items-center gap-[8px] py-[14px] text-[10px] font-medium uppercase tracking-[0.08em]"
          >
            <ChevronRight
              size={12}
              className={cn("transition-transform", contentOpen && "rotate-90")}
            />
            {isBookmarkStillCrawling(bookmark)
              ? "Saved page · still crawling"
              : "Saved page"}
          </button>
          {contentOpen && (
            <div className="border-k-border-soft h-[70vh] border-t">
              {content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
