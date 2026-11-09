"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookmarkTagsEditor } from "@/components/dashboard/bookmarks/BookmarkTagsEditor";
import { useArchiveBookmarkWithUndo } from "@/components/dashboard/bookmarks/useArchiveBookmarkWithUndo";
import SidebarSectionHeading from "@/components/shared/sidebar/SidebarSectionHeading";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth/client";
import { formatLocalDate } from "@/lib/date-format";
import useRelativeTime from "@/lib/hooks/relative-time";
import { useTranslation } from "@/lib/i18n/client";
import { canGoBackInApp, cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  Building,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  User,
  X,
} from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkDisplayTitle,
  getBookmarkRefreshInterval,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

import SummarizeBookmarkArea from "../bookmarks/SummarizeBookmarkArea";
import ActionBar from "./ActionBar";
import type { PreviewViewState } from "./PreviewDialogContext";
import type { PreviewNavigation } from "./usePreviewNavigation";
import { isEditable } from "./usePreviewNavigation";
import { AssetContentSection } from "./AssetContentSection";
import AttachmentBox from "./AttachmentBox";
import BookmarkLoadError, { retryBookmarkQuery } from "./BookmarkLoadError";
import { BookmarkListsField } from "./BookmarkListsField";
import HighlightsBox from "./HighlightsBox";
import { ICON_CONTROL_CLASS, IconTooltip } from "./IconControl";
import LinkContentSection, {
  SECTIONS_WITH_TITLE,
  useLinkSection,
} from "./LinkContentSection";
import { NoteEditor } from "./NoteEditor";
import { hostname } from "./SavedPageOverview";
import { TextContentSection } from "./TextContentSection";

const NARROW_TAB_CLASS =
  "h-9 px-2 hover:text-foreground data-[state=active]:bg-muted data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border max-sm:h-11 [@media(pointer:coarse)]:h-11";

function ContentLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <Globe className="h-12 w-12 animate-bounce text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {t("preview.crawling_in_progress")}
      </p>
    </div>
  );
}

/** A labelled day, with how long ago it was in the tooltip. */
function MetadataDate({
  icon: Icon,
  date,
  format,
}: {
  icon: LucideIcon;
  date: Date;
  format: (day: string) => string;
}) {
  const { i18n } = useTranslation();
  const { fromNow } = useRelativeTime(date, i18n.language);
  // Set after mount, as the server doesn't know the reader's timezone.
  const [day, setDay] = useState("");
  useEffect(() => {
    setDay(formatLocalDate(date, "PP", i18n.language));
  }, [date, i18n.language]);

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="flex min-h-5 w-fit shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4 shrink-0" />
          {day && <span>{format(day)}</span>}
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{fromNow}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

/** The toast and the icon in the bar are easy to miss, so it also says so here. */
function ArchivedStatus({
  bookmarkId,
  readOnly,
}: {
  bookmarkId: string;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const { setArchived, isPending } = useArchiveBookmarkWithUndo();
  return (
    <>
      <Badge variant="secondary" className="font-medium hover:bg-secondary">
        {t("preview.archived_status")}
      </Badge>
      {!readOnly && (
        <IconTooltip label={t("actions.unarchive_hint")}>
          <ActionButton
            variant="ghost"
            size="none"
            className="h-8 px-2 text-xs font-medium max-sm:h-11 [@media(pointer:coarse)]:h-11"
            loading={isPending}
            onClick={() => setArchived(bookmarkId, false)}
          >
            {t("preview.restore_archived")}
          </ActionButton>
        </IconTooltip>
      )}
    </>
  );
}

function SavedDate({
  bookmark,
  readOnly,
}: {
  bookmark: ZBookmark;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <MetadataDate
        icon={Bookmark}
        date={bookmark.createdAt}
        format={(date) => t("preview.saved_on", { date })}
      />
      {bookmark.archived && (
        <ArchivedStatus bookmarkId={bookmark.id} readOnly={readOnly} />
      )}
    </div>
  );
}

function isSameName(a: string, b: string | null | undefined) {
  return a.trim().toLowerCase() === b?.trim().toLowerCase();
}

/** What the title block above the article doesn't already say, if it's showing. */
function LinkMetadata({
  bookmark,
  readOnly,
}: {
  bookmark: ZBookmark;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const { section } = useLinkSection(bookmark);
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }
  const { author, publisher, datePublished } = bookmark.content;
  const sourceUrl = getSourceUrl(bookmark);
  const hasTitleBlock =
    section === "cached" && !isBookmarkStillCrawling(bookmark);
  const isPublisherRepeated =
    !!publisher &&
    (isSameName(publisher, author) ||
      (!!sourceUrl && isSameName(publisher, hostname(sourceUrl))));

  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
      <SavedDate bookmark={bookmark} readOnly={readOnly} />
      {author && !hasTitleBlock && (
        <div className="flex items-center gap-2">
          <User className="size-4 shrink-0" />
          <span className="min-w-0 break-words">
            {t("preview.by_author", { author })}
          </span>
        </div>
      )}
      {publisher && !isPublisherRepeated && (
        <div className="flex items-center gap-2">
          <Building className="size-4 shrink-0" />
          <span className="min-w-0 break-words">{publisher}</span>
        </div>
      )}
      {datePublished && !hasTitleBlock && (
        <MetadataDate
          icon={Calendar}
          date={datePublished}
          format={(date) => t("preview.published_on", { date })}
        />
      )}
    </div>
  );
}

function DetailsTitle({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="line-clamp-2 text-ellipsis break-words text-lg font-medium">
        {getBookmarkDisplayTitle(bookmark) ?? t("common.untitled")}
      </p>
      <Separator />
    </>
  );
}

/** Only for the views that leave the title out, like a screenshot or a video. */
function LinkDetailsTitle({ bookmark }: { bookmark: ZBookmark }) {
  const { section } = useLinkSection(bookmark);
  return isBookmarkStillCrawling(bookmark) ||
    !SECTIONS_WITH_TITLE.includes(section) ? (
    <DetailsTitle bookmark={bookmark} />
  ) : null;
}

function ViewOriginalButton({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t("preview.view_original");
  return (
    <IconTooltip
      label={t("preview.open_on_host", { host: hostname(url) })}
      side="bottom"
    >
      {/* Icon-only at phone width, where the tabs need the row's room. */}
      <Button
        asChild
        variant="ghost"
        size="none"
        className={cn(
          "h-8 shrink-0 gap-1.5 px-2 text-sm font-normal text-muted-foreground hover:text-foreground max-sm:size-11 max-sm:px-0 [@media(pointer:coarse)]:h-11",
          className,
        )}
      >
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
        >
          <ExternalLink className="size-4" />
          <span className="max-sm:sr-only">{label}</span>
        </Link>
      </Button>
    </IconTooltip>
  );
}

function NavigationButtons({
  navigation,
  className,
}: {
  navigation: PreviewNavigation;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <IconTooltip label={t("preview.previous_bookmark")} side="bottom">
        <Button
          variant="ghost"
          size="none"
          aria-label={t("preview.previous_bookmark")}
          className={cn(ICON_CONTROL_CLASS, className)}
          disabled={!navigation.onPrevious}
          onClick={navigation.onPrevious}
        >
          <ChevronLeft className="size-4" />
        </Button>
      </IconTooltip>
      <IconTooltip label={t("preview.next_bookmark")} side="bottom">
        <Button
          variant="ghost"
          size="none"
          aria-label={t("preview.next_bookmark")}
          className={cn(ICON_CONTROL_CLASS, className)}
          disabled={!navigation.onNext}
          onClick={navigation.onNext}
        >
          <ChevronRight className="size-4" />
        </Button>
      </IconTooltip>
    </>
  );
}

function CloseButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <IconTooltip label={label} side="bottom">
      <Button
        variant="ghost"
        size="none"
        aria-label={label}
        className={cn(ICON_CONTROL_CLASS, "shrink-0", className)}
        onClick={onClick}
      >
        <X className="size-4" />
      </Button>
    </IconTooltip>
  );
}

export default function BookmarkPreview({
  bookmarkId,
  initialData,
  placeholderData,
  navigation,
  view,
  onClose,
}: {
  bookmarkId: string;
  initialData?: ZBookmark;
  /** Shown while the bookmark loads, such as the grid's copy of it. */
  placeholderData?: ZBookmark;
  /** Set when the preview can move between bookmarks. */
  navigation?: PreviewNavigation;
  /** Set by the preview dialog, which keeps these while moving between bookmarks. */
  view?: PreviewViewState;
  onClose?: () => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const router = useRouter();
  const [ownActiveTab, setOwnActiveTab] = useState<string>("content");
  const [ownSidebarCollapsed, setOwnSidebarCollapsed] = useState(false);
  const activeTab = view?.activeTab ?? ownActiveTab;
  const setActiveTab = view?.setActiveTab ?? setOwnActiveTab;
  const sidebarCollapsed = view?.sidebarCollapsed ?? ownSidebarCollapsed;
  const setSidebarCollapsed =
    view?.setSidebarCollapsed ?? setOwnSidebarCollapsed;
  const [narrowToolbarSlot, setNarrowToolbarSlot] =
    useState<HTMLDivElement | null>(null);
  const [wideToolbarSlot, setWideToolbarSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const [wideTitleSlot, setWideTitleSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const { data: session } = useSession();

  // Only the full page gets here without an onClose: the modal has its own.
  const closePage = useCallback(() => {
    if (canGoBackInApp()) {
      router.back();
    } else {
      router.push("/dashboard/bookmarks");
    }
  }, [router]);
  const close = onClose ?? closePage;

  useEffect(() => {
    if (onClose) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      // Open menus and popovers mark the Escape they've used to close themselves.
      if (e.key === "Escape" && !e.defaultPrevented && !isEditable(e.target)) {
        closePage();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, closePage]);

  const {
    data: bookmark,
    error,
    isFetching,
    refetch,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId,
      },
      {
        initialData,
        placeholderData,
        retry: retryBookmarkQuery,
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) {
            return false;
          }
          return getBookmarkRefreshInterval(data);
        },
      },
    ),
  );

  if (!bookmark) {
    return error ? (
      <div className="flex h-full items-center justify-center bg-card p-4">
        <BookmarkLoadError
          error={error}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      </div>
    ) : (
      <FullPageSpinner />
    );
  }

  // Check if the current user owns this bookmark
  const isOwner = session?.user?.id === bookmark.userId;
  const sourceUrl = getSourceUrl(bookmark);
  const hasViewControls =
    !!sourceUrl || bookmark.content.type !== BookmarkTypes.TEXT;
  // A link's view controls offer the source page at phone width themselves.
  const hasViewMenu =
    bookmark.content.type === BookmarkTypes.LINK &&
    !isBookmarkStillCrawling(bookmark);

  // The wide and narrow layouts are both mounted, and each has a bar of its own
  // for the view controls.
  const renderContent = (slots: {
    toolbar: HTMLElement | null;
    title?: HTMLElement | null;
    compactToolbar?: boolean;
    onShowContent?: () => void;
  }) => {
    if (isBookmarkStillCrawling(bookmark)) {
      return <ContentLoading />;
    }
    switch (bookmark.content.type) {
      case BookmarkTypes.LINK:
        return (
          <LinkContentSection
            key={bookmark.id}
            bookmark={bookmark}
            toolbarSlot={slots.toolbar}
            compactToolbar={slots.compactToolbar}
            titleSlot={slots.title}
            originalUrl={sourceUrl}
            onShowContent={slots.onShowContent}
          />
        );
      case BookmarkTypes.TEXT:
        return (
          <TextContentSection
            key={bookmark.id}
            bookmark={bookmark}
            readOnly={!isOwner}
          />
        );
      case BookmarkTypes.ASSET:
        return (
          <AssetContentSection
            key={bookmark.id}
            bookmark={bookmark}
            // Too long for the narrow bar, so there it takes a row of its own.
            toolbarSlot={slots.compactToolbar ? undefined : slots.toolbar}
          />
        );
    }
  };

  const detailsSection = (
    <div key={bookmark.id} className="flex flex-col gap-5">
      {bookmark.content.type === BookmarkTypes.LINK && (
        <LinkDetailsTitle bookmark={bookmark} />
      )}
      {bookmark.content.type === BookmarkTypes.ASSET && (
        <DetailsTitle bookmark={bookmark} />
      )}
      {bookmark.content.type === BookmarkTypes.LINK ? (
        <LinkMetadata bookmark={bookmark} readOnly={!isOwner} />
      ) : (
        <SavedDate bookmark={bookmark} readOnly={!isOwner} />
      )}
      <SummarizeBookmarkArea bookmark={bookmark} readOnly={!isOwner} />
      <Separator />
      <div className="flex flex-col gap-1.5">
        <SidebarSectionHeading>{t("common.tags")}</SidebarSectionHeading>
        <BookmarkTagsEditor
          bookmark={bookmark}
          disabled={!isOwner}
          variant="inline"
        />
      </div>
      {isOwner && (
        <div className="flex flex-col gap-1.5">
          <SidebarSectionHeading>{t("common.lists")}</SidebarSectionHeading>
          <BookmarkListsField bookmarkId={bookmark.id} />
        </div>
      )}
      <Separator />
      <NoteEditor key={bookmark.id} bookmark={bookmark} disabled={!isOwner} />
      <HighlightsBox bookmarkId={bookmark.id} readOnly={!isOwner} />
      <Separator />
      <AttachmentBox bookmark={bookmark} readOnly={!isOwner} />
    </div>
  );

  return (
    <>
      {/* Render original layout for wide screens */}
      <div className="relative hidden h-full flex-col overflow-hidden bg-card lg:flex">
        {/* The same spot for every control, whether or not the panel is showing: */}
        {/* navigation, then how it's viewed, then what can be done to the bookmark. */}
        <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-2 py-1">
          <div className="flex shrink-0 items-center gap-0.5">
            <CloseButton label={t("preview.close")} onClick={close} />
            {navigation && <NavigationButtons navigation={navigation} />}
          </div>
          <div ref={setWideTitleSlot} className="min-w-0 flex-1 px-2" />
          <div className="flex shrink-0 items-center gap-1">
            <div
              ref={setWideToolbarSlot}
              className="flex items-center gap-1 empty:hidden"
            />
            {sourceUrl && <ViewOriginalButton url={sourceUrl} />}
          </div>
          {isOwner && (
            <>
              {hasViewControls && (
                <Separator orientation="vertical" className="mx-1 h-5" />
              )}
              <ActionBar
                bookmark={bookmark}
                className="shrink-0 gap-0.5"
                tooltipSide="bottom"
              />
            </>
          )}
          {(hasViewControls || isOwner) && (
            <Separator orientation="vertical" className="mx-1 h-5" />
          )}
          <IconTooltip
            label={t(
              sidebarCollapsed
                ? "preview.show_details"
                : "preview.hide_details",
            )}
            side="bottom"
          >
            <Button
              variant="ghost"
              size="none"
              aria-label={t(
                sidebarCollapsed
                  ? "preview.show_details"
                  : "preview.hide_details",
              )}
              aria-expanded={!sidebarCollapsed}
              className={cn(ICON_CONTROL_CLASS, "shrink-0")}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                <PanelRightOpen className="size-4" />
              ) : (
                <PanelRightClose className="size-4" />
              )}
            </Button>
          </IconTooltip>
        </div>
        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              "relative h-full min-w-0 flex-1 overflow-auto bg-background",
              // A link's views run up to the bar, and scroll by themselves.
              bookmark.content.type !== BookmarkTypes.LINK && "px-4 py-4",
            )}
          >
            {renderContent({
              toolbar: wideToolbarSlot,
              title: wideTitleSlot,
            })}
          </div>
          {!sidebarCollapsed && (
            // Wide enough for the metadata, while leaving the article its measure.
            // A step up from the reader's surface.
            <div className="w-[clamp(16rem,38%,26rem)] shrink-0 overflow-auto border-l bg-muted/40 p-5 dark:bg-card">
              {detailsSection}
            </div>
          )}
        </div>
      </div>
      {/* Render tabbed layout for narrow/vertical screens */}
      <div className="flex h-full w-full flex-col overflow-hidden bg-card lg:hidden">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="z-10 flex shrink-0 items-center gap-1 border-b px-2 py-1">
            <CloseButton label={t("preview.close")} onClick={close} />
            {/* No track behind the tabs: the raised one is the one that's showing. */}
            <TabsList className="grid h-auto min-w-0 flex-1 grid-cols-[repeat(2,minmax(4.25rem,1fr))] gap-1 bg-transparent p-0">
              <TabsTrigger value="content" className={NARROW_TAB_CLASS}>
                {t("preview.tabs.content")}
              </TabsTrigger>
              <TabsTrigger value="details" className={NARROW_TAB_CLASS}>
                {t("preview.tabs.details")}
              </TabsTrigger>
            </TabsList>
            <div
              ref={setNarrowToolbarSlot}
              className="flex min-w-0 items-center gap-0.5 empty:hidden"
            />
            {navigation && (
              <NavigationButtons
                navigation={navigation}
                className="max-sm:hidden"
              />
            )}
            {sourceUrl && (
              <ViewOriginalButton
                url={sourceUrl}
                className={hasViewMenu ? "max-sm:hidden" : undefined}
              />
            )}
          </div>
          {/* Stays mounted, as it holds the view controls in the bar above and */}
          {/* the place in the article. */}
          <TabsContent
            forceMount
            value="content"
            className="mt-0 h-full flex-1 overflow-hidden overflow-y-auto bg-background data-[state=inactive]:hidden"
          >
            {renderContent({
              toolbar: narrowToolbarSlot,
              compactToolbar: true,
              onShowContent: () => setActiveTab("content"),
            })}
          </TabsContent>
          <TabsContent
            value="details"
            className="mt-0 h-full overflow-y-auto bg-card px-4 py-3 data-[state=inactive]:hidden"
          >
            {detailsSection}
            {isOwner && (
              <div className="mt-3 border-t pt-3 max-sm:hidden">
                <ActionBar bookmark={bookmark} />
              </div>
            )}
          </TabsContent>
        </Tabs>
        {/* A sibling of the tabs, so it takes its height from them and never */}
        {/* covers the end of the article. */}
        {(isOwner || navigation) && (
          <div
            className={cn(
              "flex shrink-0 items-center border-t bg-card px-1 pb-[env(safe-area-inset-bottom)] sm:hidden",
              navigation && isOwner ? "justify-between" : "justify-center",
            )}
          >
            {navigation && (
              <div className="flex items-center">
                <NavigationButtons navigation={navigation} />
              </div>
            )}
            {isOwner && <ActionBar bookmark={bookmark} className="gap-0" />}
          </div>
        )}
      </div>
    </>
  );
}
