import type { LucideIcon } from "lucide-react-native";
import { RefreshControl, useWindowDimensions, View } from "react-native";
import QueryPageState from "@/components/QueryPageState";
import {
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { useColorScheme } from "@/lib/useColorScheme";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  BookOpen,
  Chrome,
  CircleHelp,
  Clock3,
  Code2,
  Database,
  FileText,
  Globe2,
  Hash,
  Heart,
  Highlighter,
  Image as ImageIcon,
  Link2,
  List,
  Rss,
  Smartphone,
  Upload,
  Zap,
} from "lucide-react-native";
import type { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";
import type { ZBookmarkSource } from "@karakeep/shared/types/bookmarks";
import { zUserStatsResponseSchema } from "@karakeep/shared/types/users";

type UserStats = z.infer<typeof zUserStatsResponseSchema>;

const numberFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

const storageFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

const countFormatter = new Intl.NumberFormat();
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SOURCE_DETAILS: Record<
  ZBookmarkSource,
  { label: string; icon: LucideIcon }
> = {
  api: { label: "API", icon: Zap },
  web: { label: "Web", icon: Globe2 },
  cli: { label: "CLI", icon: Code2 },
  mobile: { label: "Mobile app", icon: Smartphone },
  extension: { label: "Browser extension", icon: Chrome },
  singlefile: { label: "SingleFile", icon: FileText },
  rss: { label: "RSS feed", icon: Rss },
  import: { label: "Import", icon: Upload },
};

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${countFormatter.format(bytes)} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${storageFormatter.format(value)} ${units[unitIndex]}`;
}

function formatHour(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatAssetType(type: string) {
  const spaced = type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const { colors } = useColorScheme();

  return (
    <View
      className="overflow-hidden rounded-2xl bg-card"
      style={{ borderCurve: "continuous" }}
    >
      <View className="flex-row items-center gap-2 px-4 pb-3 pt-4">
        <Icon size={18} color={colors.primary} strokeWidth={2.25} />
        <Text className="font-semibold">{title}</Text>
      </View>
      <SettingsSeparator className="mx-4 my-0" />
      <View className="gap-4 p-4">{children}</View>
    </View>
  );
}

function MetricTile({
  label,
  value,
  icon: Icon,
  width,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  width: number;
}) {
  const { colors } = useColorScheme();

  return (
    <View
      className="rounded-2xl bg-card"
      style={{
        borderCurve: "continuous",
        minHeight: 124,
        padding: 16,
        width,
      }}
    >
      <View className="mb-4 h-8 w-8 items-center justify-center rounded-full bg-primary/10">
        <Icon size={16} color={colors.primary} strokeWidth={2.25} />
      </View>
      <Text
        selectable
        className="text-2xl font-semibold tabular-nums tracking-tight"
      >
        {value}
      </Text>
      <Text className="mt-0.5 text-sm text-muted-foreground">{label}</Text>
    </View>
  );
}

function ProgressRow({
  label,
  value,
  total,
  icon: Icon,
  color,
  detail,
  valueLabel,
}: {
  label: string;
  value: number;
  total: number;
  icon?: LucideIcon;
  color: string;
  detail?: string;
  valueLabel?: string;
}) {
  const { colors } = useColorScheme();
  const percentage = total > 0 ? Math.min(100, (value / total) * 100) : 0;

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        {Icon ? <Icon size={16} color={colors.grey} /> : null}
        <Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text className="text-xs text-muted-foreground">{detail}</Text>
        ) : null}
        <Text selectable className="text-sm font-medium tabular-nums">
          {valueLabel ?? countFormatter.format(value)}
        </Text>
      </View>
      <View
        className="bg-muted/30"
        style={{ borderRadius: 4, height: 8, overflow: "hidden" }}
      >
        <View
          style={{
            backgroundColor: color,
            borderRadius: 4,
            height: 8,
            width: `${percentage}%`,
          }}
        />
      </View>
    </View>
  );
}

function RankedList({
  items,
  emptyText,
}: {
  items: { label: string; count: number }[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return <Text className="text-sm text-muted-foreground">{emptyText}</Text>;
  }

  const maxValue = Math.max(...items.map((item) => item.count), 0);

  return (
    <View className="gap-4">
      {items.slice(0, 5).map((item, index) => (
        <View key={item.label} className="flex-row items-center gap-3">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-muted/20">
            <Text className="text-xs font-medium tabular-nums text-muted-foreground">
              {index + 1}
            </Text>
          </View>
          <View className="min-w-0 flex-1 gap-1.5">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
                {item.label}
              </Text>
              <Text selectable className="text-sm font-medium tabular-nums">
                {countFormatter.format(item.count)}
              </Text>
            </View>
            <View
              className="bg-muted/30"
              style={{ borderRadius: 2, height: 4, overflow: "hidden" }}
            >
              <View
                className="bg-primary"
                style={{
                  borderRadius: 2,
                  height: 4,
                  width: `${maxValue > 0 ? (item.count / maxValue) * 100 : 0}%`,
                }}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function ActivityCharts({ stats }: { stats: UserStats }) {
  const { colors } = useColorScheme();
  const activityByDay = dayNames.map((_, day) => {
    return (
      stats.bookmarkingActivity.byDayOfWeek.find((entry) => entry.day === day)
        ?.count ?? 0
    );
  });
  const maxDay = Math.max(...activityByDay, 0);
  const hourlyActivity = Array.from({ length: 24 }, (_, hour) => {
    return (
      stats.bookmarkingActivity.byHour.find((entry) => entry.hour === hour)
        ?.count ?? 0
    );
  });
  const maxHour = Math.max(...hourlyActivity, 0);
  const busiestHour = hourlyActivity.reduce(
    (bestHour, count, hour) =>
      count > hourlyActivity[bestHour] ? hour : bestHour,
    0,
  );

  return (
    <View className="gap-6">
      <View className="flex-row">
        {[
          ["This week", stats.bookmarkingActivity.thisWeek],
          ["This month", stats.bookmarkingActivity.thisMonth],
          ["This year", stats.bookmarkingActivity.thisYear],
        ].map(([label, value], index) => (
          <View
            key={String(label)}
            className={`flex-1 items-center px-1 ${index > 0 ? "border-l border-border" : ""}`}
          >
            <Text
              selectable
              className="text-xl font-semibold tabular-nums tracking-tight"
            >
              {formatNumber(value as number)}
            </Text>
            <Text className="mt-1 text-center text-xs text-muted-foreground">
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View className="gap-3">
        <Text className="text-sm font-medium">Days you save</Text>
        <View
          accessible
          accessibilityLabel={`Bookmarks by weekday. ${dayNames.map((day, index) => `${day} ${activityByDay[index]}`).join(", ")}`}
          className="h-28 flex-row items-end gap-2"
        >
          {activityByDay.map((count, index) => (
            <View
              key={dayNames[index]}
              className="h-full flex-1 justify-end gap-2"
            >
              <View className="flex-1 justify-end">
                <View
                  className="w-full min-w-1 rounded-t-md bg-primary"
                  style={{
                    height: maxDay > 0 ? Math.max(4, (count / maxDay) * 72) : 4,
                    opacity: count > 0 ? 1 : 0.18,
                  }}
                />
              </View>
              <Text className="text-center text-[10px] text-muted-foreground">
                {dayNames[index].slice(0, 1)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm font-medium">Time of day</Text>
          <Text className="text-xs text-muted-foreground">
            {maxHour > 0
              ? `Busiest around ${formatHour(busiestHour)}`
              : "No pattern yet"}
          </Text>
        </View>
        <View
          accessible
          accessibilityLabel={
            maxHour > 0
              ? `Bookmarks by hour. Busiest around ${formatHour(busiestHour)}.`
              : "No hourly saving pattern yet."
          }
          className="h-16 flex-row items-end gap-1"
        >
          {hourlyActivity.map((count, hour) => (
            <View
              key={hour}
              className="min-w-0 flex-1 rounded-t-sm"
              style={{
                backgroundColor: colors.primary,
                height: maxHour > 0 ? Math.max(3, (count / maxHour) * 56) : 3,
                opacity: count > 0 ? 0.35 + (count / maxHour) * 0.65 : 0.12,
              }}
            />
          ))}
        </View>
        <View className="flex-row justify-between">
          <Text className="text-[10px] text-muted-foreground">12 AM</Text>
          <Text className="text-[10px] text-muted-foreground">6 AM</Text>
          <Text className="text-[10px] text-muted-foreground">12 PM</Text>
          <Text className="text-[10px] text-muted-foreground">6 PM</Text>
        </View>
      </View>
    </View>
  );
}

function SourcesList({ stats }: { stats: UserStats }) {
  const { colors } = useColorScheme();

  if (stats.bookmarksBySource.length === 0) {
    return (
      <Text className="text-sm text-muted-foreground">
        Sources will appear after you save a bookmark.
      </Text>
    );
  }

  return (
    <View className="gap-4">
      {stats.bookmarksBySource.map(({ source, count }) => {
        const detail = source
          ? SOURCE_DETAILS[source]
          : { label: "Unknown", icon: CircleHelp };
        const Icon = detail.icon;

        return (
          <View
            key={source ?? "unknown"}
            className="flex-row items-center gap-3"
          >
            <View className="h-8 w-8 items-center justify-center rounded-full bg-muted/20">
              <Icon size={16} color={colors.grey} />
            </View>
            <Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
              {detail.label}
            </Text>
            <Text selectable className="text-sm font-medium tabular-nums">
              {countFormatter.format(count)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function StatsSkeleton() {
  return (
    <SettingsScreen contentContainerStyle={{ gap: 12 }}>
      <View className="rounded-2xl bg-card p-5">
        <Skeleton className="mb-5 h-10 w-10 rounded-full" />
        <Skeleton className="mb-2 h-10 w-28" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-6 h-12 w-full" />
      </View>
      <View className="flex-row flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-28 min-w-[145px] flex-1 rounded-2xl"
          />
        ))}
      </View>
      <Skeleton className="h-52 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </SettingsScreen>
  );
}

export default function UsageStatsScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useColorScheme();
  const api = useTRPC();
  const {
    data: stats,
    error,
    isPending,
    isRefetching,
    refetch,
  } = useQuery(api.users.stats.queryOptions());

  if (isPending) return <StatsSkeleton />;

  if (!stats) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  const assetsBySize = [...stats.assetsByType].sort(
    (left, right) => right.totalSize - left.totalSize,
  );
  const metricColumnCount = windowWidth >= 700 ? 3 : 2;
  const metricGridGap = 8;
  const metricGridWidth = windowWidth - 32;
  const metricTileWidth =
    (metricGridWidth - metricGridGap * (metricColumnCount - 1)) /
    metricColumnCount;

  return (
    <SettingsScreen
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => refetch()}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      contentContainerStyle={{ gap: 12 }}
    >
      <View
        className="overflow-hidden rounded-2xl bg-card"
        style={{ borderCurve: "continuous", padding: 20 }}
      >
        <View className="flex-row items-center justify-between gap-4">
          <View className="min-w-0 flex-1">
            <Text
              selectable
              className="text-foreground"
              style={{
                fontSize: 40,
                fontVariant: ["tabular-nums"],
                fontWeight: "600",
                letterSpacing: -1,
                lineHeight: 44,
              }}
            >
              {formatNumber(stats.numBookmarks)}
            </Text>
            <Text className="mt-1 text-muted-foreground">Bookmarks saved</Text>
          </View>
          <View
            className="items-center justify-center bg-primary/10"
            style={{ borderRadius: 22, height: 44, width: 44 }}
          >
            <BookOpen size={21} color={colors.primary} strokeWidth={2.25} />
          </View>
        </View>
        <SettingsSeparator className="mx-0" style={{ marginVertical: 18 }} />
        <View className="flex-row items-start gap-4">
          <View className="flex-1">
            <Text selectable className="font-semibold tabular-nums">
              {countFormatter.format(stats.bookmarkingActivity.thisMonth)}
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              Added this month
            </Text>
          </View>
          <View className="flex-1 items-end border-l border-border pl-4">
            <Text selectable className="font-semibold tabular-nums">
              {formatBytes(stats.totalAssetSize)}
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              Storage used
            </Text>
          </View>
        </View>
      </View>

      <SectionLabel>At a glance</SectionLabel>
      <View className="flex-row flex-wrap gap-2">
        <MetricTile
          label="Favourites"
          value={formatNumber(stats.numFavorites)}
          icon={Heart}
          width={metricTileWidth}
        />
        <MetricTile
          label="Archived"
          value={formatNumber(stats.numArchived)}
          icon={Archive}
          width={metricTileWidth}
        />
        <MetricTile
          label="Tags"
          value={formatNumber(stats.numTags)}
          icon={Hash}
          width={metricTileWidth}
        />
        <MetricTile
          label="Lists"
          value={formatNumber(stats.numLists)}
          icon={List}
          width={metricTileWidth}
        />
        <MetricTile
          label="Highlights"
          value={formatNumber(stats.numHighlights)}
          icon={Highlighter}
          width={metricTileWidth}
        />
        <MetricTile
          label="Added this year"
          value={formatNumber(stats.bookmarkingActivity.thisYear)}
          icon={Clock3}
          width={metricTileWidth}
        />
      </View>

      {stats.numBookmarks === 0 ? (
        <View
          className="overflow-hidden rounded-2xl bg-card"
          style={{ borderCurve: "continuous" }}
        >
          <EmptyState
            icon={BookOpen}
            title="Your library is ready"
            subtitle="Your saving patterns will appear here once you add a few bookmarks."
          />
        </View>
      ) : (
        <>
          <SectionLabel>Your library</SectionLabel>
          <SectionCard title="Bookmark types" icon={BookOpen}>
            <ProgressRow
              label="Links"
              value={stats.bookmarksByType.link}
              total={stats.numBookmarks}
              icon={Link2}
              color={colors.primary}
            />
            <ProgressRow
              label="Text notes"
              value={stats.bookmarksByType.text}
              total={stats.numBookmarks}
              icon={FileText}
              color="#34C759"
            />
            <ProgressRow
              label="Files and images"
              value={stats.bookmarksByType.asset}
              total={stats.numBookmarks}
              icon={ImageIcon}
              color="#AF52DE"
            />
          </SectionCard>

          <SectionCard title="Saving activity" icon={Clock3}>
            <ActivityCharts stats={stats} />
          </SectionCard>

          <SectionCard title="Top domains" icon={Globe2}>
            <RankedList
              items={stats.topDomains.map(({ domain, count }) => ({
                label: domain,
                count,
              }))}
              emptyText="Domains will appear after you save a link."
            />
          </SectionCard>

          <SectionCard title="Most used tags" icon={Hash}>
            <RankedList
              items={stats.tagUsage.map(({ name, count }) => ({
                label: name,
                count,
              }))}
              emptyText="Tags will appear as you organize your bookmarks."
            />
          </SectionCard>

          <SectionCard title="Saved with" icon={Upload}>
            <SourcesList stats={stats} />
          </SectionCard>

          {assetsBySize.length > 0 ? (
            <SectionCard title="Storage breakdown" icon={Database}>
              {assetsBySize.map((asset) => (
                <ProgressRow
                  key={asset.type}
                  label={formatAssetType(asset.type)}
                  value={asset.totalSize}
                  total={stats.totalAssetSize}
                  color={colors.primary}
                  detail={`${countFormatter.format(asset.count)} ${asset.count === 1 ? "item" : "items"}`}
                  valueLabel={formatBytes(asset.totalSize)}
                />
              ))}
            </SectionCard>
          ) : null}
        </>
      )}
    </SettingsScreen>
  );
}
