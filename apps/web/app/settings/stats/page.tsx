"use client";

import { useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import {
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsPage";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { normalizeI18nLanguage } from "@/lib/date-format";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  BarChart3,
  Bookmark,
  Chrome,
  Code,
  Database,
  FileText,
  Globe,
  Highlighter,
  Image,
  Link,
  List,
  Rss,
  Smartphone,
  Star,
  Tag,
  Upload,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { z } from "zod";

import type { AssetTypes } from "@karakeep/db/schema";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { zBookmarkSourceSchema } from "@karakeep/shared/types/bookmarks";
import { mapDBAssetTypeToUserType } from "@karakeep/trpc/lib/attachments";

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

/**
 * The composer in the web app saves without a source, so a missing source is
 * shown as a web save. This is only how the stats read, nothing stored changes.
 */
function groupSources(
  sources: { source: BookmarkSource | null; count: number }[],
) {
  const counts = new Map<BookmarkSource, number>();
  for (const { source, count } of sources) {
    const key = source ?? "web";
    counts.set(key, (counts.get(key) ?? 0) + count);
  }
  return [...counts]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

/** The domain as people say it, with www. and bare counted as the one site. */
function groupDomains(domains: { domain: string; count: number }[]) {
  const counts = new Map<string, number>();
  for (const { domain, count } of domains) {
    const key = domain.replace(/^www\./i, "");
    counts.set(key, (counts.get(key) ?? 0) + count);
  }
  return [...counts]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

const sourceIcons: Record<BookmarkSource, LucideIcon> = {
  api: Zap,
  web: Globe,
  extension: Chrome,
  cli: Code,
  mobile: Smartphone,
  singlefile: FileText,
  rss: Rss,
  import: Upload,
};

// Rounds up to 1, 2 or 5 times a power of ten, so the axis ends on a round number.
function niceCeiling(value: number) {
  if (value <= 5) {
    return value;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value) ?? 10;
  return step * magnitude;
}

// Roughly how wide a character of the text-xs value labels is, in pixels.
const VALUE_LABEL_CHAR_WIDTH = 7;

/** The width of the element, kept up to date while it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
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
  summary: string;
}) {
  const { t } = useTranslation();
  const top = niceCeiling(Math.max(...data, 0));
  const [plotRef, plotWidth] = useWidth<HTMLDivElement>();
  // Values show at rest only if the longest one fits over its own bar, the rest
  // of the time they're in the tooltip.
  const longestValue = Math.max(...data.map((v) => formatNumber(v).length));
  const showValues =
    plotWidth > 0 &&
    plotWidth / data.length >= longestValue * VALUE_LABEL_CHAR_WIDTH;
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>
      {/* The padding is room for the label over a full-height bar. */}
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 pt-4">
        <div
          aria-hidden
          className="flex h-32 flex-col justify-between text-right text-xs tabular-nums leading-none text-muted-foreground"
        >
          <span>{formatNumber(top)}</span>
          <span>0</span>
        </div>
        <div
          ref={plotRef}
          role="group"
          aria-label={title}
          className="relative h-32"
        >
          <div className="absolute inset-x-0 top-0 border-t border-dashed" />
          <div className="absolute inset-x-0 bottom-0 border-t" />
          <div
            className={cn(
              "relative flex h-full items-end",
              data.length > 12 ? "gap-0.5 sm:gap-1" : "gap-2 sm:gap-3",
            )}
          >
            {data.map((value, index) => {
              const description = t("settings.stats.activity_patterns.bar", {
                label: labels[index],
                count: value,
              });
              return (
                <Tooltip key={index} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={description}
                      className="group flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span
                        className={cn(
                          "relative block w-full max-w-8 rounded-t",
                          value > 0
                            ? "bg-primary group-hover:bg-primary/80 dark:bg-primary/70 dark:group-hover:bg-primary"
                            : "bg-muted-foreground/30",
                        )}
                        style={{
                          height: value > 0 ? `${(value / top) * 100}%` : "2px",
                          minHeight: "2px",
                        }}
                      >
                        {showValues && value > 0 && (
                          <span
                            aria-hidden
                            className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-xs tabular-nums leading-none text-muted-foreground"
                          >
                            {formatNumber(value)}
                          </span>
                        )}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipPortal>
                    <TooltipContent>{description}</TooltipContent>
                  </TooltipPortal>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <div />
        <div
          aria-hidden
          className={cn(
            "grid text-xs text-muted-foreground",
            axisLabels.length === data.length
              ? "gap-2 text-center sm:gap-3"
              : "",
          )}
          style={{ gridTemplateColumns: `repeat(${axisLabels.length}, 1fr)` }}
        >
          {axisLabels.map((label) => (
            <span key={label} className="truncate">
              {label}
            </span>
          ))}
        </div>
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

const sectionIconClass = "size-4 text-muted-foreground";

const PERIOD_DAYS = [7, 30, 365] as const;

/** One count of bookmarks added, for the period picked under it. */
function BookmarksAddedStat({
  counts,
}: {
  counts: Record<(typeof PERIOD_DAYS)[number], number>;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState<(typeof PERIOD_DAYS)[number]>(30);
  return (
    <StatTile
      className="max-sm:col-span-2"
      label={t("settings.stats.overview.bookmarks_added")}
      value={formatNumber(counts[days])}
      helper={
        <RadioGroupPrimitive.Root
          aria-label={t("settings.stats.recent_activity.period")}
          value={String(days)}
          onValueChange={(next) =>
            setDays(Number(next) as (typeof PERIOD_DAYS)[number])
          }
          className="mt-1 inline-flex rounded-md bg-muted p-0.5"
        >
          {PERIOD_DAYS.map((period) => (
            <RadioGroupPrimitive.Item
              key={period}
              value={String(period)}
              aria-label={t("settings.stats.recent_activity.days", {
                count: period,
              })}
              className="h-8 min-w-8 whitespace-nowrap rounded-sm px-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm max-sm:h-11 max-sm:min-w-11"
            >
              {t("settings.stats.recent_activity.days_short", {
                count: period,
              })}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
      }
    />
  );
}

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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StatTile key={i} label={"\u00a0"} value={0} loading />
          ))}
        </div>
      </SettingsPage>
    );
  }

  if (!stats) {
    return (
      <SettingsPage
        title={t("settings.stats.usage_statistics")}
        description={t("settings.stats.insights_description")}
      >
        <EmptyState
          icon={BarChart3}
          title={t("settings.stats.failed_to_load")}
        />
      </SettingsPage>
    );
  }

  if (stats.numBookmarks === 0) {
    return (
      <SettingsPage
        title={t("settings.stats.usage_statistics")}
        description={t("settings.stats.insights_description")}
      >
        <EmptyState
          icon={BarChart3}
          title={t("settings.stats.empty_title")}
          description={t("settings.stats.empty_description")}
          action={
            <Button asChild>
              <NextLink href="/settings/import">
                <Upload className="size-4" />
                {t("settings.stats.empty_action")}
              </NextLink>
            </Button>
          }
        />
      </SettingsPage>
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
  const sources = groupSources(stats.bookmarksBySource);
  const maxSourceCount = Math.max(...sources.map((s) => s.count), 0);
  const topDomains = groupDomains(stats.topDomains).slice(0, 8);
  const topTags = stats.tagUsage.slice(0, 8);
  const timezoneNote = userSettings?.timezone &&
    userSettings.timezone !== "UTC" && (
      <span className="text-xs text-muted-foreground">
        {userSettings.timezone}
      </span>
    );
  const allTime = t("settings.stats.activity_patterns.all_time");

  return (
    <SettingsPage
      title={t("settings.stats.usage_statistics")}
      description={t("settings.stats.insights_description")}
    >
      {/* Overview Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label={t("settings.stats.overview.total_bookmarks")}
          value={formatNumber(stats.numBookmarks)}
          icon={Bookmark}
          href="/dashboard/bookmarks"
        />
        <StatTile
          label={t("settings.stats.overview.favorites")}
          value={formatNumber(stats.numFavorites)}
          icon={Star}
          href="/dashboard/favourites"
        />
        <StatTile
          label={t("settings.stats.overview.archived")}
          value={formatNumber(stats.numArchived)}
          icon={Archive}
          href="/dashboard/archive"
        />
        <StatTile
          label={t("settings.stats.overview.tags")}
          value={formatNumber(stats.numTags)}
          icon={Tag}
          href="/dashboard/tags"
        />
        <StatTile
          label={t("settings.stats.overview.lists")}
          value={formatNumber(stats.numLists)}
          icon={List}
          href="/dashboard/lists"
        />
        <StatTile
          label={t("settings.stats.overview.highlights")}
          value={formatNumber(stats.numHighlights)}
          icon={Highlighter}
          href="/dashboard/highlights"
        />
        {/* Across the whole phone, as they don't fit its period picker otherwise. */}
        <StatTile
          className="max-sm:col-span-2"
          label={t("settings.stats.overview.storage_used")}
          value={formatBytes(stats.totalAssetSize)}
          icon={Database}
          href="/settings/assets"
        />
        <BookmarksAddedStat
          counts={{
            7: stats.bookmarkingActivity.thisWeek,
            30: stats.bookmarkingActivity.thisMonth,
            365: stats.bookmarkingActivity.thisYear,
          }}
        />
      </div>

      {/* Activity patterns */}
      <SettingsSection
        title={t("settings.stats.activity_patterns.title")}
        action={timezoneNote}
      >
        <div className="grid gap-8 md:grid-cols-5">
          <div className="md:col-span-2">
            <ColumnChart
              title={t("settings.stats.activity_patterns.activity_by_day")}
              data={activityByDay}
              labels={dayNames}
              axisLabels={dayNames}
              summary={allTime}
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
                  ? `${allTime} · ${t(
                      "settings.stats.activity_patterns.busiest_around",
                      { hour: hourLabels[busiestHour] },
                    )}`
                  : allTime
              }
            />
          </div>
        </div>
      </SettingsSection>

      {/* Rows of equal height, so that the cards line up across the columns. */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Bookmark Types */}
        <SettingsSection title={t("settings.stats.bookmark_types.title")}>
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
        </SettingsSection>

        {/* Bookmark Sources */}
        <SettingsSection title={t("settings.stats.bookmark_sources.title")}>
          {sources.length > 0 ? (
            <div className="space-y-4">
              {sources.map(({ source, count }) => {
                const Icon = sourceIcons[source];
                return (
                  <BarRow
                    key={source}
                    label={t(`settings.stats.bookmark_sources.names.${source}`)}
                    value={count}
                    maxValue={maxSourceCount}
                    icon={<Icon className={sectionIconClass} />}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("settings.stats.bookmark_sources.empty")}
            </p>
          )}
        </SettingsSection>

        {/* Top Domains */}
        <SettingsSection title={t("settings.stats.top_domains.title")}>
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
        </SettingsSection>

        {/* Top Tags */}
        <SettingsSection title={t("settings.stats.most_used_tags.title")}>
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
        </SettingsSection>
      </div>

      {/* Asset Storage */}
      {stats.assetsByType.length > 0 && (
        <SettingsSection title={t("settings.stats.storage_breakdown.title")}>
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
            {stats.assetsByType.map((asset) => (
              <div key={asset.type} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    {/* The same names as the Storage page. */}
                    {t(
                      `preview.attachments.types.${mapDBAssetTypeToUserType(asset.type as AssetTypes) ?? "unknown"}`,
                    )}
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
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
