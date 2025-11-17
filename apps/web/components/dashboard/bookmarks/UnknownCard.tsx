"use client";

import { useTranslation } from "@/lib/i18n/client";
import { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";
import { AlertCircle } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";

export default function UnknownCard({
  bookmark,
  fixedLayout,
  className,
}: {
  bookmark: ZBookmark;
  fixedLayout?: BookmarksLayoutTypes;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <BookmarkLayoutAdaptingCard
      title={bookmark.title}
      fixedLayout={fixedLayout}
      bookmark={bookmark}
      className={className}
      wrapTags={false}
      image={(_layout) => (
        <div className="flex size-full flex-1 flex-col items-center justify-center bg-red-50 dark:bg-red-950/10">
          <AlertCircle className="mb-3 h-10 w-10 text-red-500" />
          <h3 className="font-medium text-red-700 dark:text-red-400">
            {t("common.something_went_wrong")}
          </h3>
        </div>
      )}
    />
  );
}
