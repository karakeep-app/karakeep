"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/client";
import { AlertCircle } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";

export default function UnknownCard({
  bookmark,
  className,
  bookmarkIndex,
}: {
  bookmark: ZBookmark;
  className?: string;
  bookmarkIndex?: number;
}) {
  const { t } = useTranslation();
  return (
    <BookmarkLayoutAdaptingCard
      title={
        // A linked title, as the card relies on it to open the preview
        bookmark.title ? (
          <Link href={`/dashboard/preview/${bookmark.id}`}>
            {bookmark.title}
          </Link>
        ) : undefined
      }
      bookmark={bookmark}
      className={className}
      bookmarkIndex={bookmarkIndex}
      wrapTags={false}
      image={(_layout) => (
        // Opens the preview, like the title, for cards whose title is hidden
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          // The card's own preview link is the tab stop
          tabIndex={-1}
          className="flex size-full flex-1 flex-col items-center justify-center bg-muted text-muted-foreground"
        >
          <AlertCircle className="mb-2 size-5" />
          <h3 className="text-sm font-medium">
            {t("common.something_went_wrong")}
          </h3>
        </Link>
      )}
    />
  );
}
