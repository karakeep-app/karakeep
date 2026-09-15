import type { Metadata } from "next";
import React from "react";
import DashboardOverview from "@/components/dashboard/home/DashboardOverview";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.dashboard")} | Karakeep`,
  };
}

export default async function DashboardOverviewPage() {
  const [readItLater, notes, rss, favourites, archive] = await Promise.all([
    api.bookmarks.getBookmarks({
      type: BookmarkTypes.LINK,
      archived: false,
      excludeSnoozed: true,
      limit: 12,
    }),
    api.bookmarks.getBookmarks({
      type: BookmarkTypes.TEXT,
      archived: false,
      excludeSnoozed: true,
      limit: 12,
    }),
    api.bookmarks.getBookmarks({
      source: "rss",
      archived: false,
      excludeSnoozed: true,
      limit: 12,
    }),
    api.bookmarks.getBookmarks({
      favourited: true,
      archived: false,
      excludeSnoozed: true,
      limit: 12,
    }),
    api.bookmarks.getBookmarks({
      archived: true,
      limit: 12,
    }),
  ]);

  return (
    <DashboardOverview
      sections={{ readItLater, notes, rss, favourites, archive }}
    />
  );
}
