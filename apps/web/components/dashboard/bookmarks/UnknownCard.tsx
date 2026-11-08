"use client";

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
      title={bookmark.title}
      bookmark={bookmark}
      className={className}
      bookmarkIndex={bookmarkIndex}
      wrapTags={false}
      image={(_layout) => (
        <div className="flex size-full flex-1 flex-col items-center justify-center bg-muted text-muted-foreground">
          <AlertCircle className="mb-2 size-5" />
          <h3 className="text-sm font-medium">
            {t("common.something_went_wrong")}
          </h3>
        </div>
      )}
    />
  );
}
