"use client";

import { SettingsPage } from "@/components/settings/SettingsPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeI18nLanguage } from "@/lib/date-format";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  BookOpen,
  Chrome,
  Clock,
  Code,
  Database,
  FileText,
  Globe,
  Hash,
  Heart,
  HelpCircle,
  Highlighter,
  Image,
  Link,
  List,
  PieChart,
  Rss,
  Smartphone,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { zBookmarkSourceSchema } from "@karakeep/shared/types/bookmarks";

type BookmarkSource = z.infer<typeof zBookmarkSourceSchema>;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

function getDayNames(locale: string | undefined): string[] {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  // 2023-01-01 was a Sunday, matching the stats API's day 0.
  return Array.from({ length: 7 }, (_, day) =>
    formatter.format(Date.UTC(2023, 0, 1 + day)),
  );
}

function getHourLabels(locale: string | undefined): string[] {
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    timeZone: "UTC",
  });
  return Array.from({ length: 24 }, (_, hour) =>
    formatter.format(Date.UTC(2023, 0, 1, hour)),
  );
}

function formatSourceName(source: BookmarkSource | null): string {
  if (!source) return "Unknown";
  const sourceMap: Record<BookmarkSource, string> = {
    api: "API",
    web: "Web",
    extension: "Browser Extension",
    cli: "CLI",
    mobile: "Mobile App",
    singlefile: "SingleFile",
    rss: "RSS Feed",
    import: "Import",
  };
  return sourceMap[source];
}

function getSourceIcon(source: BookmarkSource | null): React.ReactNode {
  const iconProps = { className: "h-4 w-4 text-muted-foreground" };
  switch (source) {
    case "api":
      return <Zap {...iconProps} />;
    case "web":
      return <Globe {...iconProps} />;
    case "extension":
      return <Chrome {...iconProps} />;
    case "cli":
      return <Code {...iconProps} />;
    case "mobile":
      return <Smartphone {...iconProps} />;
    case "singlefile":
      return <FileText {...iconProps} />;
    case "rss":
      return <Rss {...iconProps} />;
    case "import":
      return <Upload {...iconProps} />;
    default:
      return <HelpCircle {...iconProps} />;
  }
}

function ColumnChart({
  title,
  data,
  labels,
  axisLabels,
  summary,
}: {
  title: string;
  data: number[];
  labels: string[];
  axisLabels: string[];
  summary?: string;
}) {
  const maxValue = Math.max(...data, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-medium">{title}</h4>
        {summary && (
          <span className="text-xs text-muted-foreground">{summary}</span>
        )}
      </div>
      <div
        role="img"
        aria-label={`${title}: ${data.map((value, index) => `${labels[index]} ${value}`).join(", ")}`}
        className={cn(
          "flex h-32 items-end",
          data.length > 12 ? "gap-1" : "gap-3",
        )}
      >
        {data.map((value, index) => (
          <div
            key={index}
            className="flex h-full flex-1 items-end justify-center"
          >
            <div
              className={cn(
                "w-full max-w-8 rounded-t-sm",
                value > 0 ? "bg-primary" : "bg-muted",
              )}
              style={{
                height: `${maxValue > 0 ? Math.max(2, (value / maxValue) * 100) : 2}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div
        className={cn(
          "grid text-xs text-muted-foreground",
          axisLabels.length === data.length ? "gap-3 text-center" : "",
        )}
        style={{ gridTemplateColumns: `repeat(${axisLabels.length}, 1fr)` }}
      >
        {axisLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  maxValue,
  icon,
  rank,
}: {
  label: string;
  value: number;
  maxValue: number;
  icon?: React.ReactNode;
  rank?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        {rank !== undefined && (
          <span className="w-4 text-xs tabular-nums text-muted-foreground">
            {rank}
          </span>
        )}
        {icon}
        <span className="min-w-0 flex-1 truncate" title={label}>
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/40"
          style={{
            width: `${maxValue > 0 ? (value / maxValue) * 100 : 0}%`,
          }}
        />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  action,
  className,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
        {icon}
        <CardTitle className="text-base">{title}</CardTitle>
        {action && <div className="ml-auto">{action}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function StatCard({
  title,
  value,
  icon,
  description,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums tracking-tight">
          {value}
        </div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

const sectionIconClass = "h-4 w-4 text-muted-foreground";

export default function StatsPage() {
  const api = useTRPC();
  const { t, i18n } = useTranslation();
  const { data: stats, isLoading } = useQuery(api.users.stats.queryOptions());
  const { data: userSettings } = useQuery(api.users.settings.queryOptions());

  if (isLoading) {
    return (
      <SettingsPage
        title={t("settings.stats.usage_statistics")}
        description={t("settings.stats.insights_description")}
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-2 h-8 w-16" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </SettingsPage>
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

  const locale = normalizeI18nLanguage(i18n.language);
  const dayNames = getDayNames(locale);
  const hourLabels = getHourLabels(locale);
  const activityByDay = dayNames.map(
    (_, day) =>
      stats.bookmarkingActivity.byDayOfWeek.find((d) => d.day === day)?.count ??
      0,
  );
  const activityByHour = hourLabels.map(
    (_, hour) =>
      stats.bookmarkingActivity.byHour.find((h) => h.hour === hour)?.count ?? 0,
  );
  const maxHourCount = Math.max(...activityByHour);
  const busiestHour =
    maxHourCount > 0 ? activityByHour.indexOf(maxHourCount) : undefined;
  const typeCounts = [
    {
      label: t("settings.stats.bookmark_types.links"),
      value: stats.bookmarksByType.link,
      icon: <Link className={sectionIconClass} />,
    },
    {
      label: t("settings.stats.bookmark_types.text_notes"),
      value: stats.bookmarksByType.text,
      icon: <FileText className={sectionIconClass} />,
    },
    {
      label: t("settings.stats.bookmark_types.assets"),
      value: stats.bookmarksByType.asset,
      icon: <Image className={sectionIconClass} />,
    },
  ];
  const maxSourceCount = Math.max(
    ...stats.bookmarksBySource.map((s) => s.count),
    0,
  );
  const topDomains = stats.topDomains.slice(0, 8);
  const topTags = stats.tagUsage.slice(0, 8);
  const timezoneNote = userSettings?.timezone &&
    userSettings.timezone !== "UTC" && (
      <span className="text-xs text-muted-foreground">
        {userSettings.timezone}
      </span>
    );

  return (
    <SettingsPage
      title={t("settings.stats.usage_statistics")}
      description={t("settings.stats.insights_description")}
    >
      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("settings.stats.overview.total_bookmarks")}
          value={formatNumber(stats.numBookmarks)}
          icon={<BookOpen className={sectionIconClass} />}
          description={t("settings.stats.overview.all_saved_items")}
        />
        <StatCard
          title={t("settings.stats.overview.favorites")}
          value={formatNumber(stats.numFavorites)}
          icon={<Heart className={sectionIconClass} />}
          description={t("settings.stats.overview.starred_bookmarks")}
        />
        <StatCard
          title={t("settings.stats.overview.archived")}
          value={formatNumber(stats.numArchived)}
          icon={<Archive className={sectionIconClass} />}
          description={t("settings.stats.overview.archived_items")}
        />
        <StatCard
          title={t("settings.stats.overview.tags")}
          value={formatNumber(stats.numTags)}
          icon={<Hash className={sectionIconClass} />}
          description={t("settings.stats.overview.unique_tags_created")}
        />
        <StatCard
          title={t("settings.stats.overview.lists")}
          value={formatNumber(stats.numLists)}
          icon={<List className={sectionIconClass} />}
          description={t("settings.stats.overview.bookmark_collections")}
        />
        <StatCard
          title={t("settings.stats.overview.highlights")}
          value={formatNumber(stats.numHighlights)}
          icon={<Highlighter className={sectionIconClass} />}
          description={t("settings.stats.overview.text_highlights")}
        />
        <StatCard
          title={t("settings.stats.overview.storage_used")}
          value={formatBytes(stats.totalAssetSize)}
          icon={<Database className={sectionIconClass} />}
          description={t("settings.stats.overview.total_asset_storage")}
        />
        <StatCard
          title={t("settings.stats.overview.this_month")}
          value={formatNumber(stats.bookmarkingActivity.thisMonth)}
          icon={<TrendingUp className={sectionIconClass} />}
          description={t("settings.stats.overview.bookmarks_added")}
        />
      </div>

      {/* Recent Activity */}
      <SectionCard
        title={t("settings.stats.recent_activity.title")}
        icon={<Clock className={sectionIconClass} />}
        action={timezoneNote}
      >
        <div className="space-y-8">
          <div className="grid grid-cols-3 divide-x rounded-lg border">
            {[
              {
                label: t("settings.stats.recent_activity.this_week"),
                value: stats.bookmarkingActivity.thisWeek,
              },
              {
                label: t("settings.stats.recent_activity.this_month"),
                value: stats.bookmarkingActivity.thisMonth,
              },
              {
                label: t("settings.stats.recent_activity.this_year"),
                value: stats.bookmarkingActivity.thisYear,
              },
            ].map(({ label, value }) => (
              <div key={label} className="px-4 py-3">
                <div className="text-2xl font-semibold tabular-nums tracking-tight">
                  {formatNumber(value)}
                </div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-2">
              <ColumnChart
                title={t("settings.stats.activity_patterns.activity_by_day")}
                data={activityByDay}
                labels={dayNames}
                axisLabels={dayNames}
              />
            </div>
            <div className="md:col-span-3">
              <ColumnChart
                title={t("settings.stats.activity_patterns.activity_by_hour")}
                data={activityByHour}
                labels={hourLabels}
                axisLabels={[0, 6, 12, 18].map((hour) => hourLabels[hour])}
                summary={
                  busiestHour !== undefined
                    ? t("settings.stats.activity_patterns.busiest_around", {
                        hour: hourLabels[busiestHour],
                      })
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Bookmark Types */}
        <SectionCard
          title={t("settings.stats.bookmark_types.title")}
          icon={<PieChart className={sectionIconClass} />}
        >
          <div className="space-y-4">
            {typeCounts.map((type) => (
              <BarRow
                key={type.label}
                label={type.label}
                value={type.value}
                maxValue={stats.numBookmarks}
                icon={type.icon}
              />
            ))}
          </div>
        </SectionCard>

        {/* Bookmark Sources */}
        <SectionCard
          title={t("settings.stats.bookmark_sources.title")}
          icon={<Zap className={sectionIconClass} />}
        >
          {stats.bookmarksBySource.length > 0 ? (
            <div className="space-y-4">
              {stats.bookmarksBySource.map((source) => (
                <BarRow
                  key={source.source || "unknown"}
                  label={formatSourceName(source.source)}
                  value={source.count}
                  maxValue={maxSourceCount}
                  icon={getSourceIcon(source.source)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("settings.stats.bookmark_sources.empty")}
            </p>
          )}
        </SectionCard>

        {/* Top Domains */}
        <SectionCard
          title={t("settings.stats.top_domains.title")}
          icon={<Globe className={sectionIconClass} />}
        >
          {topDomains.length > 0 ? (
            <div className="space-y-4">
              {topDomains.map((domain, index) => (
                <BarRow
                  key={domain.domain}
                  rank={index + 1}
                  label={domain.domain}
                  value={domain.count}
                  maxValue={topDomains[0].count}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("settings.stats.top_domains.no_domains_found")}
            </p>
          )}
        </SectionCard>

        {/* Top Tags */}
        <SectionCard
          title={t("settings.stats.most_used_tags.title")}
          icon={<Hash className={sectionIconClass} />}
        >
          {topTags.length > 0 ? (
            <div className="space-y-4">
              {topTags.map((tag, index) => (
                <BarRow
                  key={tag.name}
                  rank={index + 1}
                  label={tag.name}
                  value={tag.count}
                  maxValue={topTags[0].count}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("settings.stats.most_used_tags.no_tags_found")}
            </p>
          )}
        </SectionCard>
      </div>

      {/* Asset Storage */}
      {stats.assetsByType.length > 0 && (
        <SectionCard
          title={t("settings.stats.storage_breakdown.title")}
          icon={<Database className={sectionIconClass} />}
        >
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
            {stats.assetsByType.map((asset) => (
              <div key={asset.type} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate capitalize">
                    {asset.type.replace(/([A-Z])/g, " $1").trim()}
                    <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                      {asset.count}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatBytes(asset.totalSize)}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/40"
                    style={{
                      width: `${stats.totalAssetSize > 0 ? (asset.totalSize / stats.totalAssetSize) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </SettingsPage>
  );
}
