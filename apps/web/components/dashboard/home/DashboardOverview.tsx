"use client";

import { useTranslation } from "@/lib/i18n/client";
import { useQuickAddStore } from "@/lib/store/useQuickAddStore";
import { Archive, BookOpenText, NotebookPen, Rss, Star } from "lucide-react";

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
  const openQuickAdd = useQuickAddStore((s) => s.openDialog);

  return (
    <div className="flex flex-col gap-8">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("dashboard.hero_title")}
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          {t("dashboard.hero_subtitle")}
        </p>
      </div>

      <DashboardRow
        title={t("dashboard.read_it_later")}
        query={{
          type: BookmarkTypes.LINK,
          archived: false,
          excludeSnoozed: true,
          limit: 12,
        }}
        initialBookmarks={sections.readItLater}
        emptyState={{
          icon: BookOpenText,
          title: t("dashboard.empty.read_it_later_title"),
          description: t("dashboard.empty.read_it_later_description"),
          action: {
            label: t("dashboard.empty.save_something"),
            onClick: openQuickAdd,
          },
        }}
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
        emptyState={{
          icon: NotebookPen,
          title: t("dashboard.empty.notes_title"),
          description: t("dashboard.empty.notes_description"),
          action: {
            label: t("dashboard.empty.write_a_note"),
            onClick: openQuickAdd,
          },
        }}
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
        emptyState={{
          icon: Rss,
          title: t("dashboard.empty.rss_title"),
          description: t("dashboard.empty.rss_description"),
          action: {
            label: t("dashboard.empty.add_a_feed"),
            href: "/settings/feeds",
          },
        }}
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
        emptyState={{
          icon: Star,
          title: t("dashboard.empty.favourites_title"),
          description: t("dashboard.empty.favourites_description"),
        }}
      />
      <DashboardRow
        title={t("dashboard.archive")}
        query={{
          archived: true,
          limit: 12,
        }}
        initialBookmarks={sections.archive}
        emptyState={{
          icon: Archive,
          title: t("dashboard.empty.archive_title"),
          description: t("dashboard.empty.archive_description"),
        }}
      />
    </div>
  );
}
