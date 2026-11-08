"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useArchiveBookmarkWithUndo } from "@/components/dashboard/bookmarks/useArchiveBookmarkWithUndo";
import HighlightCard from "@/components/dashboard/highlights/HighlightCard";
import ArticleTitleBlock, {
  useReadingMinutes,
  useTitleScrolledAway,
} from "@/components/dashboard/preview/ArticleTitleBlock";
import BookmarkLoadError, {
  retryBookmarkQuery,
} from "@/components/dashboard/preview/BookmarkLoadError";
import ReaderSettingsPopover from "@/components/dashboard/preview/ReaderSettingsPopover";
import {
  ICON_CONTROL_CLASS,
  IconTooltip,
} from "@/components/dashboard/preview/IconControl";
import ReaderBarActions, {
  ReaderMoreMenu,
} from "@/components/dashboard/preview/ReaderBarActions";
import ReaderView from "@/components/dashboard/preview/ReaderView";
import { hostname } from "@/components/dashboard/preview/SavedPageOverview";
import { readerColumnWidth } from "@/components/dashboard/preview/readerColumn";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Separator } from "@/components/ui/separator";
import { useSession } from "@/lib/auth/client";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  HighlighterIcon as Highlight,
  Highlighter,
  Printer,
  X,
} from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { READER_FONT_FAMILIES } from "@karakeep/shared/types/readers";
import {
  getBookmarkDisplayTitle,
  getSourceUrl,
} from "@karakeep/shared/utils/bookmarkUtils";

/** The height of the bar, for what lines up under it. */
const BAR_HEIGHT_PX = 56;

export default function ReaderViewPage() {
  const api = useTRPC();
  const { t } = useTranslation();
  const params = useParams<{ bookmarkId: string }>();
  const bookmarkId = params.bookmarkId;
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId,
    }),
  );
  const {
    data: bookmark,
    error: bookmarkError,
    isFetching: isFetchingBookmark,
    refetch: refetchBookmark,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId,
      },
      { retry: retryBookmarkQuery },
    ),
  );

  const readingMinutes = useReadingMinutes(bookmarkId);
  const { titleRef, isTitleAway } = useTitleScrolledAway(BAR_HEIGHT_PX);

  const { data: session } = useSession();
  const router = useRouter();
  const { settings } = useReaderSettings();
  const [showHighlights, setShowHighlights] = useState(false);
  const isOwner = session?.user?.id === bookmark?.userId;

  // The reader only renders saved articles. Notes and files read best in the preview.
  const isNotLink = !!bookmark && bookmark.content.type !== BookmarkTypes.LINK;
  useEffect(() => {
    if (isNotLink) {
      router.replace(`/dashboard/preview/${bookmarkId}`);
    }
  }, [isNotLink, bookmarkId, router]);

  const onClose = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const columnRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Leaves the reader as well, so the undo moves with the toast to the next page.
  const { setArchived: finishAndArchive, isPending: isFinishing } =
    useArchiveBookmarkWithUndo({ onDone: onClose });

  // Nothing here to read, so nothing for the bar's controls to act on.
  if (!bookmark && bookmarkError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <BookmarkLoadError
          error={bookmarkError}
          onRetry={() => refetchBookmark()}
          isRetrying={isFetchingBookmark}
          className="w-full max-w-lg"
        />
      </div>
    );
  }

  const title = bookmark && getBookmarkDisplayTitle(bookmark);
  const sourceUrl = bookmark && getSourceUrl(bookmark);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur print:hidden"
      >
        <div className="flex h-14 items-center justify-between gap-2 px-4 max-sm:gap-0 max-sm:px-1">
          <div className="flex min-w-0 items-center gap-2">
            <IconTooltip label={t("actions.close")} side="bottom">
              <Button
                variant="ghost"
                size="none"
                aria-label={t("actions.close")}
                className={ICON_CONTROL_CLASS}
                onClick={onClose}
              >
                <X className="size-4" />
              </Button>
            </IconTooltip>
            {isTitleAway && title ? (
              <span className="min-w-0 truncate text-sm font-medium">
                {title}
              </span>
            ) : (
              sourceUrl && (
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {hostname(sourceUrl)}
                </span>
              )
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 max-sm:gap-0">
            {bookmark && isOwner && (
              <div className="contents max-sm:hidden">
                <ReaderBarActions bookmark={bookmark} />
                <Separator orientation="vertical" className="mx-1 h-5" />
              </div>
            )}
            <IconTooltip label={t("preview.print")} side="bottom">
              <Button
                variant="ghost"
                size="none"
                aria-label={t("preview.print")}
                className={cn(ICON_CONTROL_CLASS, "max-sm:hidden")}
                onClick={handlePrint}
              >
                <Printer className="size-4" />
              </Button>
            </IconTooltip>

            <ReaderSettingsPopover variant="ghost" columnRef={columnRef} />

            <IconTooltip label={t("preview.toggle_highlights")} side="bottom">
              <Button
                variant="ghost"
                size="none"
                aria-label={t("preview.toggle_highlights")}
                aria-pressed={showHighlights}
                className={cn(
                  ICON_CONTROL_CLASS,
                  "max-sm:hidden",
                  showHighlights && "bg-accent text-foreground",
                )}
                onClick={() => setShowHighlights(!showHighlights)}
              >
                <Highlight className="size-4" />
              </Button>
            </IconTooltip>

            <ReaderMoreMenu
              bookmark={isOwner ? bookmark : undefined}
              className="sm:hidden"
              onPrint={handlePrint}
              onShowHighlights={() => setShowHighlights(true)}
            />
          </div>
        </div>
      </header>

      <div className="flex overflow-hidden">
        {/* Mobile backdrop */}
        {showHighlights && (
          <button
            className="fixed inset-0 top-14 z-40 bg-black/50 lg:hidden"
            onClick={() => setShowHighlights(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowHighlights(false);
              }
            }}
            aria-label={t("preview.close_highlights")}
          />
        )}

        {/* Main Content */}
        <main
          className={`flex-1 overflow-x-hidden transition-all duration-300 ${showHighlights ? "lg:mr-80" : ""}`}
        >
          <article className="overflow-x-hidden px-4 py-8 sm:px-6">
            {bookmark ? (
              // Sets the font here too, so the title and the article below share
              // the column that the reader's settings size in ch.
              <div
                ref={columnRef}
                className="mx-auto"
                style={{
                  fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
                  fontSize: `${settings.fontSize}px`,
                  maxWidth: readerColumnWidth(settings.fontFamily),
                }}
              >
                <ArticleTitleBlock bookmark={bookmark} titleRef={titleRef} />

                {/* Article Content */}
                <Suspense fallback={<FullPageSpinner />}>
                  <div className="overflow-x-hidden">
                    <ReaderView
                      style={{
                        fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: settings.lineHeight,
                      }}
                      bookmarkId={bookmarkId}
                      readOnly={!isOwner}
                      progressBarStyle={{
                        position: "fixed",
                        top: "3.5rem",
                        height: 2,
                      }}
                      progressBarAlwaysVisible
                    />
                  </div>
                </Suspense>

                {isOwner && readingMinutes && !bookmark.archived && (
                  <footer className="mt-12 flex justify-center border-t pt-6 font-sans print:hidden">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground max-sm:h-11"
                      disabled={isFinishing}
                      onClick={() => finishAndArchive(bookmarkId, true)}
                    >
                      <Archive className="size-4" />
                      {t("preview.finish_and_archive")}
                    </Button>
                  </footer>
                )}
              </div>
            ) : (
              <FullPageSpinner />
            )}
          </article>
        </main>

        {/* Highlights Sidebar */}
        {showHighlights && highlights && (
          <aside className="fixed right-0 top-14 z-50 h-[calc(100vh-3.5rem)] w-full border-l bg-background sm:w-80 lg:z-auto lg:bg-background/95 lg:backdrop-blur lg:supports-[backdrop-filter]:bg-background/60 print:hidden">
            <div className="flex h-full flex-col">
              <div className="border-b p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{t("common.highlights")}</h2>
                  <div className="flex items-center gap-2">
                    {highlights.highlights.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {t("preview.highlights_saved_count", {
                          count: highlights.highlights.length,
                        })}
                      </span>
                    )}
                    <IconTooltip label={t("preview.close_highlights")}>
                      <Button
                        variant="ghost"
                        size="none"
                        aria-label={t("preview.close_highlights")}
                        className={cn(ICON_CONTROL_CLASS, "lg:hidden")}
                        onClick={() => setShowHighlights(false)}
                      >
                        <X className="size-4" />
                      </Button>
                    </IconTooltip>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {highlights.highlights.length > 0 ? (
                  <div className="space-y-4">
                    {highlights.highlights.map((highlight) => (
                      <HighlightCard
                        key={highlight.id}
                        highlight={highlight}
                        clickable={true}
                        readOnly={!isOwner}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty className="p-4 md:p-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Highlighter />
                      </EmptyMedia>
                      <EmptyTitle className="text-base">
                        {t("highlights.empty_title")}
                      </EmptyTitle>
                      <EmptyDescription>
                        {isOwner
                          ? t("highlights.empty_description")
                          : undefined}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
