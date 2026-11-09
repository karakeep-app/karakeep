"use client";

import { useTranslation } from "@/lib/i18n/client";
import { Bookmark, Search } from "lucide-react";

export default function NoBookmarksBanner({
  isSearch = false,
}: {
  // Nothing matched a search, which doesn't mean there are no bookmarks
  isSearch?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = isSearch ? Search : Bookmark;
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50 p-10 text-center shadow-sm dark:border dark:bg-card dark:shadow-none">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-muted">
        <Icon className="h-8 w-8 text-slate-400 dark:text-slate-300" />
      </div>
      <h3 className="mb-2 text-xl font-medium text-slate-700 dark:text-slate-100">
        {isSearch
          ? t("search.no_results_title")
          : t("banners.no_bookmarks.title")}
      </h3>
      <p className="mb-6 max-w-md text-slate-500 dark:text-slate-400">
        {isSearch
          ? t("search.no_results_description")
          : t("banners.no_bookmarks.description")}
      </p>
    </div>
  );
}
