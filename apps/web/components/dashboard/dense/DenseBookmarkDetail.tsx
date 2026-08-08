"use client";

import { useState } from "react";
import { BookmarkTagsEditor } from "@/components/dashboard/bookmarks/BookmarkTagsEditor";
import {
  ArchivedActionIcon,
  FavouritedActionIcon,
} from "@/components/dashboard/bookmarks/icons";
import { AssetContentSection } from "@/components/dashboard/preview/AssetContentSection";
import AttachmentBox from "@/components/dashboard/preview/AttachmentBox";
import HighlightsBox from "@/components/dashboard/preview/HighlightsBox";
import LinkContentSection from "@/components/dashboard/preview/LinkContentSection";
import { NoteEditor } from "@/components/dashboard/preview/NoteEditor";
import { TextContentSection } from "@/components/dashboard/preview/TextContentSection";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { useSession } from "@/lib/auth/client";
import { getDenseRowTitle } from "@/lib/dense/bookmarkDisplay";
import { formatSavedAgo } from "@/lib/dense/format";
import { parseSummary } from "@/lib/dense/summary";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  useSummarizeBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkRefreshInterval,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

/** Mono section label — `SUMMARY`, `KEY POINTS`, ... */
const SECTION_LABEL =
  "font-k-mono text-k-fg-dim text-[10px] font-medium uppercase tracking-[0.08em]";

const ACTION_ICON =
  "text-k-fg-muted hover:text-k-fg flex items-center justify-center disabled:opacity-50";

/**
 * The design's source line is the URL rather than the bare domain
 * (`ui.shadcn.com/docs/theming`), so keep the path but drop the scheme and
 * any query string, which would blow past the line at 11px mono.
 */
function displayUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

/**
 * Detail read-out for the dense fork, built to the prototype's 1c pane: the
 * AI title and summary lead, and the original page is demoted to a reference
 * line and a disclosure below. Karakeep's own preview surfaces (note,
 * attachments, highlights, the archived page itself) are kept underneath so
 * the redesign doesn't cost the app any functionality.
 */
export default function DenseBookmarkDetail({
  bookmarkId,
  initialData,
  onClose,
}: {
  bookmarkId: string;
  initialData?: ZBookmark;
  onClose?: () => void;
}) {
  const api = useTRPC();
  const { data: session } = useSession();
  const [contentOpen, setContentOpen] = useState(false);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);

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

  const onError = () => toast.error("Something went wrong");
  const { mutate: updateBookmark, isPending: isUpdating } = useUpdateBookmark({
    onError,
  });
  const { mutate: resummarise, isPending: isResummarising } =
    useSummarizeBookmark({
      onError,
      onSuccess: () => toast.success("Re-summarising…"),
    });

  if (!bookmark) {
    return <FullPageSpinner />;
  }

  const isOwner = session?.user?.id === bookmark.userId;
  const sourceUrl = getSourceUrl(bookmark);
  const title = getDenseRowTitle(bookmark);
  const originalTitle =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.title
      : null;
  // Only worth showing as a reference line when it's actually a second,
  // different title — otherwise it just repeats the heading above it.
  const showOriginalTitle = !!originalTitle && originalTitle !== title;
  const isPendingSummary = bookmark.summarizationStatus === "pending";
  const { lead, keyPoints, trail } = parseSummary(bookmark.summary);

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
    <div className="bg-k-bg flex h-full flex-col">
      {/* Sticky rather than merely flex-none: in the dialog this sits above
          a scrolling body, but on the full-page route `<main>` is the
          scroller, and without this the actions would scroll away. */}
      <div className="border-k-border bg-k-bg sticky top-0 z-10 flex flex-none items-center gap-[10px] border-b px-[22px] py-[13px]">
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
          className={ACTION_ICON}
        >
          <FavouritedActionIcon
            favourited={bookmark.favourited}
            size={16}
            strokeWidth={1.75}
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
          className={ACTION_ICON}
        >
          <ArchivedActionIcon
            archived={bookmark.archived}
            size={16}
            strokeWidth={1.75}
          />
        </button>
        <button
          type="button"
          aria-label="Edit tags"
          aria-expanded={tagEditorOpen}
          disabled={!isOwner}
          onClick={() => setTagEditorOpen((open) => !open)}
          className={ACTION_ICON}
        >
          <TagIcon size={16} strokeWidth={1.75} />
        </button>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open original"
            className={ACTION_ICON}
          >
            <ExternalLink size={16} strokeWidth={1.75} />
          </a>
        )}

        <button
          type="button"
          disabled={!isOwner || isResummarising || isPendingSummary}
          onClick={() => resummarise({ bookmarkId: bookmark.id })}
          className="font-k-mono border-k-accent-border text-k-accent ml-auto inline-flex items-center gap-[6px] rounded-full border px-[9px] py-[3px] text-[10.5px] font-medium uppercase tracking-[0.06em] disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            className={cn(isResummarising && "animate-spin")}
          />
          Re-summarise
        </button>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(ACTION_ICON, "ml-[10px]")}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-[600px] flex-col gap-[22px] px-[34px] pb-[30px] pt-[26px]">
          <div className="flex flex-col gap-[10px]">
            <p className="font-k-mono text-k-fg-dim text-[11px]">
              {sourceUrl && <>{displayUrl(sourceUrl)} · </>}
              {formatSavedAgo(bookmark.createdAt)}
            </p>
            <h1 className="text-k-fg text-[25px] font-semibold leading-[1.22] tracking-[-0.025em] [text-wrap:pretty]">
              {title}
            </h1>
            {showOriginalTitle && (
              <div className="flex flex-wrap items-center gap-[7px]">
                <span className="font-k-mono text-k-accent text-[10px] font-medium uppercase tracking-[0.08em]">
                  AI title
                </span>
                <span className="font-k-mono text-k-version text-[10.5px]">
                  original: “{originalTitle}”
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-[9px]">
            <p className={SECTION_LABEL}>Summary</p>
            {isPendingSummary ? (
              <div className="flex flex-col gap-[6px]">
                <div className="bg-k-border h-2 rounded-[3px]" />
                <div className="bg-k-border h-2 rounded-[3px]" />
                <div className="bg-k-border h-2 w-[72%] rounded-[3px]" />
              </div>
            ) : lead ? (
              // Title-led reading emphasis: detail summary 13px / 1.5.
              <p className="text-k-summary-strong whitespace-pre-line text-[13px] leading-[1.5] [text-wrap:pretty]">
                {lead}
              </p>
            ) : (
              <p className="text-k-fg-dim text-[13px] leading-[1.5]">
                No summary yet.
              </p>
            )}
          </div>

          {keyPoints.length > 0 && (
            <div className="flex flex-col gap-[10px]">
              <p className={SECTION_LABEL}>Key points</p>
              <ul className="text-k-fg-muted flex flex-col gap-[8px] text-[13px] leading-[1.55]">
                {keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-[10px]">
                    <span className="text-k-accent flex-none" aria-hidden>
                      —
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              {trail && (
                <p className="text-k-summary-strong whitespace-pre-line text-[13px] leading-[1.5] [text-wrap:pretty]">
                  {trail}
                </p>
              )}
            </div>
          )}

          <div className="border-k-border flex flex-col gap-[10px] border-t pt-[16px]">
            {tagEditorOpen ? (
              <BookmarkTagsEditor bookmark={bookmark} disabled={!isOwner} />
            ) : (
              <div className="flex flex-wrap items-center gap-[6px]">
                {bookmark.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="border-k-border text-k-fg-muted rounded-full border px-[9px] py-[2px] text-[11px]"
                  >
                    {tag.name}
                  </span>
                ))}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setTagEditorOpen(true)}
                    className="text-k-fg-dim hover:text-k-fg-muted border-k-border-dashed rounded-full border border-dashed px-[9px] py-[2px] text-[11px]"
                  >
                    + tag
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-[9px]">
            <p className={SECTION_LABEL}>Note</p>
            <NoteEditor
              bookmark={bookmark}
              disabled={!isOwner}
              className="border-k-border bg-k-surface-2 text-k-fg-muted placeholder:text-k-fg-dim min-h-[4.5rem] rounded-[8px] text-[13px] leading-[1.5]"
            />
          </div>

          <AttachmentBox bookmark={bookmark} readOnly={!isOwner} />
          <HighlightsBox bookmarkId={bookmark.id} readOnly={!isOwner} />
        </div>

        {/* The archived page is the reference material behind the briefing,
            so it stays collapsed until asked for. Its renderers (reader view,
            screenshot, PDF, video) all size to their container, hence the
            explicit height rather than letting it collapse to nothing. */}
        <div className="border-k-border border-t">
          <button
            type="button"
            aria-expanded={contentOpen}
            onClick={() => setContentOpen((open) => !open)}
            className="font-k-mono text-k-fg-dim hover:text-k-fg-muted flex w-full items-center gap-[8px] px-[34px] py-[14px] text-[10px] font-medium uppercase tracking-[0.08em]"
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
