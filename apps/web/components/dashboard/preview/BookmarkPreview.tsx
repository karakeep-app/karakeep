"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkTagsEditor } from "@/components/dashboard/bookmarks/BookmarkTagsEditor";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useRelativeTime from "@/lib/hooks/relative-time";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { Building, CalendarDays, ExternalLink, User } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkRefreshInterval,
  getBookmarkTitle,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

import SummarizeBookmarkArea from "../bookmarks/SummarizeBookmarkArea";
import ActionBar from "./ActionBar";
import { AssetContentSection } from "./AssetContentSection";
import AttachmentBox from "./AttachmentBox";
import HighlightsBox from "./HighlightsBox";
import LinkContentSection from "./LinkContentSection";
import { NoteEditor } from "./NoteEditor";
import { TextContentSection } from "./TextContentSection";

function ContentLoading() {
  return (
    <div className="flex w-full flex-col gap-2">
      <Skeleton className="h-4" />
      <Skeleton className="h-4" />
      <Skeleton className="h-4" />
    </div>
  );
}

function CreationTime({ createdAt }: { createdAt: Date }) {
  const { fromNow, localCreatedAt } = useRelativeTime(createdAt);
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="flex w-fit gap-2">
          <CalendarDays /> {fromNow}
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{localCreatedAt}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

function BookmarkMetadata({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const { author, publisher, datePublished } = bookmark.content;

  if (!author && !publisher && !datePublished) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {author && (
        <div className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <User size={16} />
          <span>By {author}</span>
        </div>
      )}
      {publisher && (
        <div className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <Building size={16} />
          <span>{publisher}</span>
        </div>
      )}
      {datePublished && <PublishedDate datePublished={datePublished} />}
    </div>
  );
}

function PublishedDate({ datePublished }: { datePublished: Date }) {
  const { fromNow, localCreatedAt } = useRelativeTime(datePublished);
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays size={16} />
          <span>Published {fromNow}</span>
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{localCreatedAt}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

export default function BookmarkPreview({
  bookmarkId,
  initialData,
}: {
  bookmarkId: string;
  initialData?: ZBookmark;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>("content");

  const { data: bookmark } = api.bookmarks.getBookmark.useQuery(
    {
      bookmarkId,
    },
    {
      initialData,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) {
          return false;
        }
        return getBookmarkRefreshInterval(data);
      },
    },
  );

  if (!bookmark) {
    return <FullPageSpinner />;
  }

  let content;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK: {
      content = <LinkContentSection bookmark={bookmark} />;
      break;
    }
    case BookmarkTypes.TEXT: {
      content = <TextContentSection bookmark={bookmark} />;
      break;
    }
    case BookmarkTypes.ASSET: {
      content = <AssetContentSection bookmark={bookmark} />;
      break;
    }
  }

  const sourceUrl = getSourceUrl(bookmark);
  const title = getBookmarkTitle(bookmark);

  // Common content for both layouts
  const contentSection = isBookmarkStillCrawling(bookmark) ? (
    <ContentLoading />
  ) : (
    content
  );

  const detailsSection = (
    <div className="flex flex-col gap-4">
      <div className="flex w-full flex-col items-center justify-center gap-y-2">
        <div className="flex w-full items-center justify-center gap-2">
          <p className="line-clamp-2 text-ellipsis break-words text-lg">
            {title === undefined || title === "" ? "Untitled" : title}
          </p>
        </div>
        {sourceUrl && (
          <Link
            href={sourceUrl}
            target="_blank"
            className="flex items-center gap-2 text-gray-400"
          >
            <span>{t("preview.view_original")}</span>
            <ExternalLink />
          </Link>
        )}
        <Separator />
      </div>
      <CreationTime createdAt={bookmark.createdAt} />
      <BookmarkMetadata bookmark={bookmark} />
      <SummarizeBookmarkArea bookmark={bookmark} />
      <div className="flex items-center gap-4">
        <p className="text-sm text-gray-400">{t("common.tags")}</p>
        <BookmarkTagsEditor bookmark={bookmark} />
      </div>
      <div className="flex gap-4">
        <p className="pt-2 text-sm text-gray-400">{t("common.note")}</p>
        <NoteEditor bookmark={bookmark} />
      </div>
      <AttachmentBox bookmark={bookmark} />
      <HighlightsBox bookmarkId={bookmark.id} />
      <ActionBar bookmark={bookmark} />
    </div>
  );

  return (
    <>
      {/* Render original layout for wide screens */}
      <div className="hidden h-full grid-cols-3 overflow-hidden bg-background lg:grid">
        <div className="col-span-2 h-full w-full overflow-auto p-2">
          {contentSection}
        </div>
        <div className="flex flex-col gap-4 overflow-auto bg-accent p-4">
          {detailsSection}
        </div>
      </div>

      {/* Render tabbed layout for narrow/vertical screens */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex h-full w-full flex-col overflow-hidden lg:hidden"
      >
        <TabsList
          className={`sticky top-0 z-10 grid h-auto w-full grid-cols-2`}
        >
          <TabsTrigger value="content">{t("preview.tabs.content")}</TabsTrigger>
          <TabsTrigger value="details">{t("preview.tabs.details")}</TabsTrigger>
        </TabsList>
        <TabsContent
          value="content"
          className="h-full flex-1 overflow-hidden overflow-y-auto bg-background p-2 data-[state=inactive]:hidden"
        >
          {contentSection}
        </TabsContent>
        <TabsContent
          value="details"
          className="h-full overflow-y-auto bg-accent p-4 data-[state=inactive]:hidden"
        >
          {detailsSection}
        </TabsContent>
      </Tabs>
    </>
  );
}
