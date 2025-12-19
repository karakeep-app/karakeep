"use dom";

import { useMemo } from "react";
import type { z } from "zod";
import type { zUserStatsResponseSchema } from "@karakeep/shared/types/users";
import {
  formatBytes,
  formatNumber,
  formatSourceName,
  dayNames,
  hourLabels,
  type BookmarkSource,
} from "@karakeep/shared/utils/statsUtils";

type UserStats = z.infer<typeof zUserStatsResponseSchema>;

interface StatsDisplayProps {
  stats: UserStats;
  timezone?: string;
}

// Simple card component using Tailwind
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border bg-white dark:bg-gray-900 dark:border-gray-800 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4 border-b dark:border-gray-800">{children}</div>;
}

function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-lg font-semibold ${className}`}>{children}</h3>;
}

function CardContent({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-4 ${className}`}>{children}</div>;
}

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: string }) {
  const variantClasses = variant === "secondary"
    ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
    : "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses}`}>
      {children}
    </span>
  );
}

function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800 ${className}`}>
      <div
        className="h-full bg-blue-600 dark:bg-blue-500 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
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
          <div className="w-16 text-right text-xs text-gray-600 dark:text-gray-400 truncate">
            {labels[index]}
          </div>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
              style={{
                width: `${maxValue > 0 ? (value / maxValue) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="w-8 text-right text-xs text-gray-600 dark:text-gray-400">
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
  icon: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between space-y-0 pb-0">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <span className="text-2xl">{icon}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-gray-600 dark:text-gray-400">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function getSourceIcon(source: BookmarkSource | null): string {
  switch (source) {
    case "api":
      return "⚡";
    case "web":
      return "🌐";
    case "extension":
      return "🧩";
    case "cli":
      return "⌨️";
    case "mobile":
      return "📱";
    case "singlefile":
      return "📄";
    case "rss":
      return "📡";
    case "import":
      return "📥";
    default:
      return "❓";
  }
}

export default function StatsDisplay({ stats, timezone }: StatsDisplayProps) {
  const maxHourlyActivity = useMemo(() => {
    if (!stats) return 0;
    return Math.max(
      ...stats.bookmarkingActivity.byHour.map((h) => h.count),
    );
  }, [stats]);

  const maxDailyActivity = useMemo(() => {
    if (!stats) return 0;
    return Math.max(
      ...stats.bookmarkingActivity.byDayOfWeek.map((d) => d.count),
    );
  }, [stats]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 p-6">
      <style>{`
        * {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        .space-y-2 > * + * { margin-top: 0.5rem; }
        .space-y-3 > * + * { margin-top: 0.75rem; }
        .space-y-4 > * + * { margin-top: 1rem; }
        .space-y-6 > * + * { margin-top: 1.5rem; }
      `}</style>

      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold mb-2">Usage Statistics</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Insights into your bookmarking habits and collection
            {timezone && timezone !== "UTC" && (
              <span className="block text-sm mt-1">
                Times shown in {timezone} timezone
              </span>
            )}
          </p>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Bookmarks"
            value={formatNumber(stats.numBookmarks)}
            icon="📚"
            description="All saved items"
          />
          <StatCard
            title="Favorites"
            value={formatNumber(stats.numFavorites)}
            icon="❤️"
            description="Starred bookmarks"
          />
          <StatCard
            title="Archived"
            value={formatNumber(stats.numArchived)}
            icon="📦"
            description="Archived items"
          />
          <StatCard
            title="Tags"
            value={formatNumber(stats.numTags)}
            icon="#️⃣"
            description="Unique tags created"
          />
          <StatCard
            title="Lists"
            value={formatNumber(stats.numLists)}
            icon="📋"
            description="Bookmark collections"
          />
          <StatCard
            title="Highlights"
            value={formatNumber(stats.numHighlights)}
            icon="✏️"
            description="Text highlights"
          />
          <StatCard
            title="Storage Used"
            value={formatBytes(stats.totalAssetSize)}
            icon="💾"
            description="Total asset storage"
          />
          <StatCard
            title="This Month"
            value={formatNumber(stats.bookmarkingActivity.thisMonth)}
            icon="📈"
            description="Bookmarks added"
          />
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {/* Bookmark Types */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>📊</span>
                Bookmark Types
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>🔗</span>
                    <span className="text-sm">Links</span>
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
                    <span>📝</span>
                    <span className="text-sm">Text Notes</span>
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
                    <span>🖼️</span>
                    <span className="text-sm">Assets</span>
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
                <span>🕐</span>
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 items-center">
              <div className="grid w-full grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-500">
                    {stats.bookmarkingActivity.thisWeek}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    This Week
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-500">
                    {stats.bookmarkingActivity.thisMonth}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    This Month
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-500">
                    {stats.bookmarkingActivity.thisYear}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    This Year
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Domains */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🌍</span>
                Top Domains
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topDomains.length > 0 ? (
                <div className="space-y-3">
                  {stats.topDomains
                    .slice(0, 8)
                    .map((domain, index) => (
                      <div
                        key={domain.domain}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 text-xs font-medium">
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
                    ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No domains found
                </p>
              )}
            </CardContent>
          </Card>

          {/* Top Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>#️⃣</span>
                Most Used Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.tagUsage.length > 0 ? (
                <div className="space-y-3">
                  {stats.tagUsage
                    .slice(0, 8)
                    .map((tag, index) => (
                      <div
                        key={tag.name}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 text-xs font-medium">
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
                    ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No tags found
                </p>
              )}
            </CardContent>
          </Card>

          {/* Bookmark Sources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>⚡</span>
                Bookmark Sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.bookmarksBySource.length > 0 ? (
                <div className="space-y-3">
                  {stats.bookmarksBySource.map((source) => (
                    <div
                      key={source.source || "unknown"}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 dark:text-gray-400">
                          {getSourceIcon(source.source)}
                        </span>
                        <span className="max-w-[200px] truncate text-sm">
                          {formatSourceName(source.source)}
                        </span>
                      </div>
                      <Badge variant="secondary">{source.count}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No sources found
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity Patterns */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {/* Hourly Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🕐</span>
                Activity by Hour
                {timezone && timezone !== "UTC" && (
                  <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
                    ({timezone})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarChart
                data={stats.bookmarkingActivity.byHour.map((h) => h.count)}
                maxValue={maxHourlyActivity}
                labels={hourLabels}
              />
            </CardContent>
          </Card>

          {/* Daily Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>📊</span>
                Activity by Day
                {timezone && timezone !== "UTC" && (
                  <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
                    ({timezone})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarChart
                data={stats.bookmarkingActivity.byDayOfWeek.map((d) => d.count)}
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
                <span>💾</span>
                Storage Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {stats.assetsByType.map((asset) => (
                  <div key={asset.type} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">
                        {asset.type.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <Badge variant="outline">{asset.count}</Badge>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
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
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
