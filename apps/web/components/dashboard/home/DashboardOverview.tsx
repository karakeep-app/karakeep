"use client";

import { useTranslation } from "@/lib/i18n/client";

import type { ZGetBookmarksResponse } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import DashboardRow from "./DashboardRow";

export interface DashboardOverviewSections {
  readItLater: ZGetBookmarksResponse;
  notes: ZGetBookmarksResponse;
  rss: ZGetBookmarksResponse;
  favourites: ZGetBookmarksResponse;
  archive: ZGetBookmarksResponse;
}

export default function DashboardOverview({
  sections,
}: {
  sections: DashboardOverviewSections;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-8">
      <DashboardRow
        title={t("dashboard.read_it_later")}
        query={{
          type: BookmarkTypes.LINK,
          archived: false,
          excludeSnoozed: true,
          limit: 12,
        }}
        initialBookmarks={sections.readItLater}
      />
      <DashboardRow
        title={t("dashboard.notes")}
        query={{
          type: BookmarkTypes.TEXT,
          archived: false,
          excludeSnoozed: true,
          limit: 12,
        }}
        initialBookmarks={sections.notes}
      />
      <DashboardRow
        title={t("dashboard.rss")}
        query={{
          source: "rss",
          archived: false,
          excludeSnoozed: true,
          limit: 12,
        }}
        initialBookmarks={sections.rss}
      />
      <DashboardRow
        title={t("dashboard.favourites")}
        query={{
          favourited: true,
          archived: false,
          excludeSnoozed: true,
          limit: 12,
        }}
        initialBookmarks={sections.favourites}
      />
      <DashboardRow
        title={t("dashboard.archive")}
        query={{
          archived: true,
          limit: 12,
        }}
        initialBookmarks={sections.archive}
      />
    </div>
  );
}
