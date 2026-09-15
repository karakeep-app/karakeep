"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/client";
import { Bookmark } from "lucide-react";

export default function NoBookmarksBanner() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Bookmark}
      title={t("banners.no_bookmarks.title")}
      description={t("banners.no_bookmarks.description")}
    />
  );
}
