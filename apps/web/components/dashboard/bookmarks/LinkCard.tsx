"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { useBookmarkDisplaySettings } from "@/lib/userLocalSettings/bookmarksLayout";
import { useUserSettings } from "@/lib/userSettings";
import { cn } from "@/lib/utils";
import { TriangleAlert } from "lucide-react";

import type { ZBookmarkTypeLink } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkDisplayTitle,
  getBookmarkLinkImageUrl,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";
import BookmarkFavicon from "./BookmarkFavicon";
import CardImage from "./CardImage";
import FooterLinkURL, { getDisplayDomain } from "./FooterLinkURL";

const useOnClickUrl = (bookmark: ZBookmarkTypeLink) => {
  const userSettings = useUserSettings();
  return {
    urlTarget:
      userSettings.bookmarkClickAction === "open_original_link"
        ? ("_blank" as const)
        : ("_self" as const),
    onClickUrl:
      userSettings.bookmarkClickAction === "expand_bookmark_preview"
        ? `/dashboard/preview/${bookmark.id}`
        : bookmark.content.url,
  };
};

function hasNoImage(bookmark: ZBookmarkTypeLink) {
  return (
    !isBookmarkStillCrawling(bookmark) &&
    !getBookmarkLinkImageUrl(bookmark.content)
  );
}

function LinkTitle({ bookmark }: { bookmark: ZBookmarkTypeLink }) {
  const { onClickUrl, urlTarget } = useOnClickUrl(bookmark);
  const parsedUrl = new URL(bookmark.content.url);
  return (
    <Link href={onClickUrl} target={urlTarget} rel="noreferrer">
      {getBookmarkDisplayTitle(bookmark) ?? parsedUrl.host}
    </Link>
  );
}

function LinkImage({
  bookmark,
  className,
}: {
  bookmark: ZBookmarkTypeLink;
  className?: string;
}) {
  const { onClickUrl, urlTarget } = useOnClickUrl(bookmark);
  const { imageFit } = useBookmarkDisplaySettings();
  const link = bookmark.content;

  if (hasNoImage(bookmark)) {
    return (
      <Link
        href={onClickUrl}
        target={urlTarget}
        rel="noreferrer"
        // The title right below goes to the same place
        tabIndex={-1}
        aria-hidden
        className="flex size-full items-center justify-center bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        {/* The domain is already in the footer */}
        <BookmarkFavicon
          src={link.favicon}
          domain={getDisplayDomain(link.url)}
        />
      </Link>
    );
  }

  const imageDetails = getBookmarkLinkImageUrl(link);
  // The middle of a page is a fragment of text, the top is what it looks like
  const isScreenshot = !link.imageAssetId && !!link.screenshotAssetId;
  const isCroppedScreenshot = isScreenshot && imageFit === "cover";

  let img: React.ReactNode = null;
  if (isBookmarkStillCrawling(bookmark)) {
    img = <Image className={className} alt="" fill src="/blur.avif" />;
  } else if (imageDetails) {
    img = (
      <CardImage
        className={cn(className, isCroppedScreenshot && "object-top")}
        alt=""
        src={imageDetails.url}
        isScreenshot={isScreenshot}
      />
    );
  }

  return (
    <Link
      href={onClickUrl}
      target={urlTarget}
      rel="noreferrer"
      // The title right below goes to the same place
      tabIndex={-1}
      aria-hidden
      className={className}
    >
      <div className="relative size-full flex-1">{img}</div>
    </Link>
  );
}

/** The card's still there, but what's in it is only what was known beforehand. */
function CrawlFailedIcon() {
  const { t } = useTranslation();
  const label = t("preview.crawl_failed");
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <span role="img" aria-label={label} className="flex shrink-0">
          <TriangleAlert aria-hidden className="size-4 text-destructive" />
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{label}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

export default function LinkCard({
  bookmark: bookmarkLink,
  className,
  bookmarkIndex,
}: {
  bookmark: ZBookmarkTypeLink;
  className?: string;
  bookmarkIndex?: number;
}) {
  return (
    <BookmarkLayoutAdaptingCard
      title={<LinkTitle bookmark={bookmarkLink} />}
      footer={
        <span className="flex min-w-0 max-w-full items-center gap-1">
          {bookmarkLink.content.crawlStatus === "failure" && (
            <CrawlFailedIcon />
          )}
          <FooterLinkURL url={getSourceUrl(bookmarkLink)} />
        </span>
      }
      bookmark={bookmarkLink}
      wrapTags={false}
      imageIsPlaceholder={hasNoImage(bookmarkLink)}
      image={(_layout, className) => (
        <LinkImage className={className} bookmark={bookmarkLink} />
      )}
      className={className}
      bookmarkIndex={bookmarkIndex}
    />
  );
}
