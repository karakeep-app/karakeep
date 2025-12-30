"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { WrappedModal } from "@/components/wrapped";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import {
  Archive,
  BarChart3,
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
  Rss,
  Smartphone,
  Sparkles,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { z } from "zod";

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

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourLabels = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`,
);

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

function SimpleBarChart({
  data,
  maxValue,
  labels,
}: {
  data: number[];
  maxValue: number;
  labels: string[];
}) {
  return (
    <div className="space-y-2">
      {data.map((value, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="w-12 text-right text-xs text-muted-foreground">
            {labels[index]}
          </div>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: `${maxValue > 0 ? (value / maxValue) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="w-8 text-right text-xs text-muted-foreground">
            {value}
          </div>
        </div>
      ))}
    </div>
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
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function StatsPage() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = api.users.stats.useQuery();
  const { data: userSettings } = api.users.settings.useQuery();
  const { data: hasWrapped } = api.users.hasWrapped.useQuery();
  const [showWrapped, setShowWrapped] = useState(false);

  const maxHourlyActivity = useMemo(() => {
    if (!stats) return 0;
    return Math.max(
      ...stats.bookmarkingActivity.byHour.map(
        (h: { hour: number; count: number }) => h.count,
      ),
    );
  }, [stats]);

  const maxDailyActivity = useMemo(() => {
    if (!stats) return 0;
    return Math.max(
      ...stats.bookmarkingActivity.byDayOfWeek.map(
        (d: { day: number; count: number }) => d.count,
      ),
    );
  }, [stats]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {t("settings.stats.usage_statistics")}
          </h1>
          <p className="text-muted-foreground">
            Insights into your bookmarking habits and collection
            {userSettings?.timezone && userSettings.timezone !== "UTC" && (
              <span className="block text-sm">
                Times shown in {userSettings.timezone} timezone
              </span>
            )}
          </p>
        </div>
        {hasWrapped && (
          <Button onClick={() => setShowWrapped(true)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            View Your 2025 Wrapped
          </Button>
        )}
      </div>

      <WrappedModal open={showWrapped} onClose={() => setShowWrapped(false)} />

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("settings.stats.overview.total_bookmarks")}
          value={formatNumber(stats.numBookmarks)}
          icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
          description={t("settings.stats.overview.all_saved_items")}
        />
        <StatCard
          title={t("settings.stats.overview.favorites")}
          value={formatNumber(stats.numFavorites)}
          icon={<Heart className="h-4 w-4 text-muted-foreground" />}
          description={t("settings.stats.overview.starred_bookmarks")}
        />
        <StatCard
          title={t("settings.stats.overview.archived")}
          value={formatNumber(stats.numArchived)}
          icon={<Archive className="h-4 w-4 text-muted-foreground" />}
          description={t("settings.stats.overview.archived_items")}
        />
        <StatCard
          title={t("settings.stats.overview.tags")}
          value={formatNumber(stats.numTags)}
          icon={<Hash className="h-4 w-4 text-muted-foreground" />}
          description={t("settings.stats.overview.unique_tags_created")}
        />
        <StatCard
          title={t("settings.stats.overview.lists")}
          value={formatNumber(stats.numLists)}
          icon={<List className="h-4 w-4 text-muted-foreground" />}
          description={t("settings.stats.overview.bookmark_collections")}
        />
        <StatCard
          title={t("settings.stats.overview.highlights")}
          value={formatNumber(stats.numHighlights)}
          icon={<Highlighter className="h-4 w-4 text-muted-foreground" />}
          description={t("settings.stats.overview.text_highlights")}
        />
        <StatCard
          title={t("settings.stats.overview.storage_used")}
          value={formatBytes(stats.totalAssetSize)}
          icon={<Database className="h-4 w-4 text-muted-foreground" />}
          description={t("settings.stats.overview.total_asset_storage")}
        />
        <StatCard
          title={t("settings.stats.overview.this_month")}
          value={formatNumber(stats.bookmarkingActivity.thisMonth)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          description={t("settings.stats.overview.bookmarks_added")}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Bookmark Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t("settings.stats.bookmark_types.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">
                    {t("settings.stats.bookmark_types.links")}
                  </span>
                </div>
                <span className="text-sm font-medium">
                  {stats.bookmarksByType.link}
                </span>
              </div>
              <Progress
                value={
                  stats.numBookmarks > 0
                    ? (stats.bookmarksByType.link / stats.numBookmarks) * 100
                    : 0
                }
                className="h-2"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-500" />
                  <span className="text-sm">
                    {t("settings.stats.bookmark_types.text_notes")}
                  </span>
                </div>
                <span className="text-sm font-medium">
                  {stats.bookmarksByType.text}
                </span>
              </div>
              <Progress
                value={
                  stats.numBookmarks > 0
                    ? (stats.bookmarksByType.text / stats.numBookmarks) * 100
                    : 0
                }
                className="h-2"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">
                    {t("settings.stats.bookmark_types.assets")}
                  </span>
                </div>
                <span className="text-sm font-medium">
                  {stats.bookmarksByType.asset}
                </span>
              </div>
              <Progress
                value={
                  stats.numBookmarks > 0
                    ? (stats.bookmarksByType.asset / stats.numBookmarks) * 100
                    : 0
                }
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("settings.stats.recent_activity.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 items-center">
            <div className="grid w-full grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {stats.bookmarkingActivity.thisWeek}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("settings.stats.recent_activity.this_week")}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {stats.bookmarkingActivity.thisMonth}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("settings.stats.recent_activity.this_month")}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {stats.bookmarkingActivity.thisYear}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("settings.stats.recent_activity.this_year")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Domains */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {t("settings.stats.top_domains.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topDomains.length > 0 ? (
              <div className="space-y-3">
                {stats.topDomains
                  .slice(0, 8)
                  .map(
                    (
                      domain: { domain: string; count: number },
                      index: number,
                    ) => (
                      <div
                        key={domain.domain}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {index + 1}
                          </div>
                          <span
                            className="max-w-[200px] truncate text-sm"
                            title={domain.domain}
                          >
                            {domain.domain}
                          </span>
                        </div>
                        <Badge variant="secondary">{domain.count}</Badge>
                      </div>
                    ),
                  )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("settings.stats.top_domains.no_domains_found")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top Tags */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              {t("settings.stats.most_used_tags.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.tagUsage.length > 0 ? (
              <div className="space-y-3">
                {stats.tagUsage
                  .slice(0, 8)
                  .map(
                    (tag: { name: string; count: number }, index: number) => (
                      <div
                        key={tag.name}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {index + 1}
                          </div>
                          <span
                            className="max-w-[200px] truncate text-sm"
                            title={tag.name}
                          >
                            {tag.name}
                          </span>
                        </div>
                        <Badge variant="secondary">{tag.count}</Badge>
                      </div>
                    ),
                  )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("settings.stats.most_used_tags.no_tags_found")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Bookmark Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {t("settings.stats.bookmark_sources.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.bookmarksBySource.length > 0 ? (
              <div className="space-y-3">
                {stats.bookmarksBySource.map(
                  (source: {
                    source: BookmarkSource | null;
                    count: number;
                  }) => (
                    <div
                      key={source.source || "unknown"}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        {getSourceIcon(source.source)}
                        <span className="max-w-[200px] truncate text-sm">
                          {formatSourceName(source.source)}
                        </span>
                      </div>
                      <Badge variant="secondary">{source.count}</Badge>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("settings.stats.bookmark_sources.empty")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Patterns */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Hourly Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("settings.stats.activity_patterns.activity_by_hour")}
              {userSettings?.timezone && userSettings.timezone !== "UTC" && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({userSettings.timezone})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={stats.bookmarkingActivity.byHour.map(
                (h: { hour: number; count: number }) => h.count,
              )}
              maxValue={maxHourlyActivity}
              labels={hourLabels}
            />
          </CardContent>
        </Card>

        {/* Daily Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t("settings.stats.activity_patterns.activity_by_day")}
              {userSettings?.timezone && userSettings.timezone !== "UTC" && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({userSettings.timezone})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={stats.bookmarkingActivity.byDayOfWeek.map(
                (d: { day: number; count: number }) => d.count,
              )}
              maxValue={maxDailyActivity}
              labels={dayNames}
            />
          </CardContent>
        </Card>
      </div>

      {/* Asset Storage */}
      {stats.assetsByType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {t("settings.stats.storage_breakdown.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {stats.assetsByType.map(
                (asset: { type: string; count: number; totalSize: number }) => (
                  <div key={asset.type} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">
                        {asset.type.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <Badge variant="outline">{asset.count}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(asset.totalSize)}
                    </div>
                    <Progress
                      value={
                        stats.totalAssetSize > 0
                          ? (asset.totalSize / stats.totalAssetSize) * 100
                          : 0
                      }
                      className="h-2"
                    />
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
