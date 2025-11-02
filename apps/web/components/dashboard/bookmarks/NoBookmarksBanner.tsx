"use client";

import { useTranslation } from "@/lib/i18n/client";
import { Bookmark } from "lucide-react";

export default function NoBookmarksBanner() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50 p-10 text-center shadow-sm dark:bg-slate-700/50 dark:shadow-md">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
        <Bookmark className="h-8 w-8 text-slate-400 dark:text-slate-300" />
      </div>
      <h3 className="mb-2 text-xl font-medium text-slate-700 dark:text-slate-100">
        {t("banners.no_bookmarks.title")}
      </h3>
      <p className="mb-6 max-w-md text-slate-500 dark:text-slate-400">
        {t("banners.no_bookmarks.description")}
      </p>
    </div>
  );
}
