"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

import type { ZBookmarkTypeCollection } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";

function CollectionImage({
  bookmark,
  className,
  imageCountLabel,
  coverLabel,
}: {
  bookmark: ZBookmarkTypeCollection;
  className?: string;
  imageCountLabel: string;
  coverLabel: string;
}) {
  const items = bookmark.content.items;
  const count = items.length;
  const visibleItems = items.slice(0, 4);
  const remainingCount = count - visibleItems.length;
  const imageFitClass = className?.includes("object-contain")
    ? "object-contain"
    : "object-cover";

  return (
    <Link
      href={`/dashboard/preview/${bookmark.id}`}
      aria-label={imageCountLabel}
      className={cn("relative block overflow-hidden bg-muted", className)}
    >
      {visibleItems.length > 0 ? (
        <div
          className={cn(
            "grid size-full overflow-hidden",
            count > 1 &&
              "grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-1 bg-background",
            count === 3 && "grid-rows-2",
            count >= 4 && "grid-rows-3",
          )}
        >
          {visibleItems.map((item, index) => (
            <div
              key={item.assetId}
              className={cn(
                "relative min-h-0 min-w-0 overflow-hidden bg-muted",
                index === 0 && count === 3 && "row-span-2",
                index === 0 && count >= 4 && "row-span-3",
              )}
            >
              <Image
                alt={`${coverLabel} ${index + 1}`}
                src={getAssetUrl(item.assetId)}
                fill={true}
                unoptimized
                className={imageFitClass}
              />
              {index === visibleItems.length - 1 && remainingCount > 0 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white">
                  +{remainingCount}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="size-full" />
      )}
      {count > 1 && (
        <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white shadow-sm">
          {imageCountLabel}
        </span>
      )}
    </Link>
  );
}

export default function CollectionCard({
  bookmark,
  className,
  bookmarkIndex,
}: {
  bookmark: ZBookmarkTypeCollection;
  className?: string;
  bookmarkIndex?: number;
}) {
  const { t } = useTranslation();
  const imageCountLabel = t("common.image_count", {
    count: bookmark.content.items.length,
  });

  return (
    <BookmarkLayoutAdaptingCard
      title={bookmark.title ?? imageCountLabel}
      bookmark={bookmark}
      className={className}
      bookmarkIndex={bookmarkIndex}
      wrapTags={true}
      image={(_layout, className) => (
        <div className="relative size-full flex-1">
          <CollectionImage
            bookmark={bookmark}
            className={className}
            imageCountLabel={imageCountLabel}
            coverLabel={t("common.collection_cover")}
          />
        </div>
      )}
    />
  );
}
