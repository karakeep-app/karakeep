"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/client";
import { useBookmarkDisplaySettings } from "@/lib/userLocalSettings/bookmarksLayout";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

import type { ZBookmarkTypeAsset } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import {
  getBookmarkDisplayTitle,
  getSourceUrl,
} from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";
import CardImage from "./CardImage";
import FooterLinkURL from "./FooterLinkURL";

function AssetImage({
  bookmark,
  className,
}: {
  bookmark: ZBookmarkTypeAsset;
  className?: string;
}) {
  const bookmarkedAsset = bookmark.content;
  const { imageFit } = useBookmarkDisplaySettings();
  // The screenshot that failed to load, so a newer one still gets a chance
  const [failedScreenshotId, setFailedScreenshotId] = useState<string | null>(
    null,
  );
  switch (bookmarkedAsset.assetType) {
    case "image": {
      return (
        // The title goes to the same place
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          tabIndex={-1}
          aria-hidden
          // The image fills this, so it needs a position of its own
          className="absolute inset-0"
        >
          <CardImage
            alt="asset"
            src={getAssetUrl(bookmarkedAsset.assetId)}
            className={className}
          />
        </Link>
      );
    }
    case "pdf": {
      const screenshotAssetId = bookmark.assets.find(
        (r) => r.assetType === "assetScreenshot",
      )?.id;
      if (!screenshotAssetId || screenshotAssetId === failedScreenshotId) {
        return (
          <Link
            href={`/dashboard/preview/${bookmark.id}`}
            tabIndex={-1}
            aria-hidden
            className={cn(
              className,
              "flex items-center justify-center bg-muted text-muted-foreground",
            )}
            title="PDF screenshot not available. Run asset preprocessing job to generate one screenshot"
          >
            <FileText aria-hidden className="size-8" />
          </Link>
        );
      }
      return (
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          tabIndex={-1}
          aria-hidden
          className="absolute inset-0"
        >
          <Image
            alt="asset"
            src={getAssetUrl(screenshotAssetId)}
            fill={true}
            unoptimized
            onError={() => setFailedScreenshotId(screenshotAssetId)}
            // A screenshot of the first page, whose top says what it is
            className={cn(className, imageFit === "cover" && "object-top")}
          />
        </Link>
      );
    }
    default: {
      const _exhaustiveCheck: never = bookmarkedAsset.assetType;
      return <span />;
    }
  }
}

export default function AssetCard({
  bookmark: bookmarkedAsset,
  className,
  bookmarkIndex,
}: {
  bookmark: ZBookmarkTypeAsset;
  className?: string;
  bookmarkIndex?: number;
}) {
  const { t } = useTranslation();
  return (
    <BookmarkLayoutAdaptingCard
      title={
        <Link href={`/dashboard/preview/${bookmarkedAsset.id}`}>
          {getBookmarkDisplayTitle(bookmarkedAsset) ?? t("common.untitled")}
        </Link>
      }
      footer={
        getSourceUrl(bookmarkedAsset) && (
          <FooterLinkURL url={getSourceUrl(bookmarkedAsset)} />
        )
      }
      bookmark={bookmarkedAsset}
      className={className}
      bookmarkIndex={bookmarkIndex}
      wrapTags={true}
      image={(_layout, className) => (
        <div className="relative size-full flex-1">
          <AssetImage bookmark={bookmarkedAsset} className={className} />
        </div>
      )}
    />
  );
}
