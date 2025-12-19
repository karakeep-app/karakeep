"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/client";
import { useUserStats, useUserSettings } from "@karakeep/shared-react/hooks/users";
import StatsDisplay from "@karakeep/shared-react/components/stats/StatsDisplay.dom";

export default function StatsPage() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useUserStats();
  const { data: userSettings } = useUserSettings();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            {t("settings.stats.usage_statistics")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings.stats.insights_description")}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-6">
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">
          {t("settings.stats.failed_to_load")}
        </p>
      </div>
    );
  }

  return <StatsDisplay stats={stats} timezone={userSettings?.timezone} />;
}
