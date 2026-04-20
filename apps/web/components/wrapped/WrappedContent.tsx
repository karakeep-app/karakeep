"use client";

import { forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  BookOpen,
  Calendar,
  Chrome,
  Clock,
  Code,
  FileText,
  Globe,
  Hash,
  Heart,
  Highlighter,
  Link,
  Rss,
  Smartphone,
  Upload,
  Zap,
} from "lucide-react";
import { z } from "zod";

import { zBookmarkSourceSchema } from "@karakeep/shared/types/bookmarks";
import { zWrappedStatsResponseSchema } from "@karakeep/shared/types/users";

type WrappedStats = z.infer<typeof zWrappedStatsResponseSchema>;
type BookmarkSource = z.infer<typeof zBookmarkSourceSchema>;

interface WrappedContentProps {
  stats: WrappedStats;
  userName?: string;
}

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

function getSourceIcon(source: BookmarkSource | null, className = "h-5 w-5") {
  const iconProps = { className };
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
      return <Globe {...iconProps} />;
  }
}

export const WrappedContent = forwardRef<HTMLDivElement, WrappedContentProps>(
  ({ stats, userName }, ref) => {
    const maxMonthlyCount = Math.max(
      ...stats.monthlyActivity.map((m) => m.count),
    );

    return (
      <div
        ref={ref}
        className="min-h-screen w-full overflow-auto bg-slate-950 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(16,185,129,0.18),transparent),radial-gradient(900px_500px_at_90%_10%,rgba(14,116,144,0.2),transparent)] p-6 text-slate-100 md:p-8"
      >
        <div className="mx-auto max-w-5xl space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold md:text-3xl">
                Your {stats.year} Wrapped
              </h1>
              <p className="mt-1 text-xs text-slate-300 md:text-sm">
                A Year in Karakeep
              </p>
              {userName && (
                <p className="mt-2 text-sm text-slate-400">{userName}</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Card className="flex flex-col items-center justify-center border border-white/10 bg-white/5 p-4 text-center text-slate-100 backdrop-blur-sm">
              <p className="text-xs text-slate-300">You saved</p>
              <p className="my-2 text-3xl font-semibold md:text-4xl">
                {stats.totalBookmarks}
              </p>
              <p className="text-xs text-slate-300">
                {stats.totalBookmarks === 1 ? "item" : "items"} this year
              </p>
            </Card>
            {/* First Bookmark */}
            {stats.firstBookmark && (
              <Card className="border border-white/10 bg-white/5 p-4 text-slate-100 backdrop-blur-sm">
                <div className="flex h-full flex-col">
                  <div className="mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4 flex-shrink-0 text-emerald-300" />
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">
                      First Bookmark of {stats.year}
                    </p>
                  </div>
                  <div className="flex-1">
                    <p className="text-2xl font-bold text-slate-100">
                      {new Date(
                        stats.firstBookmark.createdAt,
                      ).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    {stats.firstBookmark.title && (
                      <p className="mt-2 line-clamp-2 text-base leading-relaxed text-slate-300">
                        &ldquo;{stats.firstBookmark.title}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Activity + Peak */}
            <Card className="border border-white/10 bg-white/5 p-4 text-slate-100 backdrop-blur-sm">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
                <Clock className="h-4 w-4" />
                Activity Highlights
              </h2>
              <div className="grid gap-2 text-sm">
                {stats.mostActiveDay && (
                  <div>
                    <p className="text-xs text-slate-400">Most Active Day</p>
                    <p className="text-base font-semibold">
                      {new Date(stats.mostActiveDay.date).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {stats.mostActiveDay.count}{" "}
                      {stats.mostActiveDay.count === 1 ? "save" : "saves"}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-slate-400">Peak Hour</p>
                    <p className="text-base font-semibold">
                      {stats.peakHour === 0
                        ? "12 AM"
                        : stats.peakHour < 12
                          ? `${stats.peakHour} AM`
                          : stats.peakHour === 12
                            ? "12 PM"
                            : `${stats.peakHour - 12} PM`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Peak Day</p>
                    <p className="text-base font-semibold">
                      {dayNames[stats.peakDayOfWeek]}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Top Lists */}
            {(stats.topDomains.length > 0 || stats.topTags.length > 0) && (
              <Card className="border border-white/10 bg-white/5 p-4 text-slate-100 backdrop-blur-sm md:col-span-2 lg:col-span-2">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Top Lists
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {stats.topDomains.length > 0 && (
                    <div>
                      <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <Globe className="h-3.5 w-3.5" />
                        Sites
                      </h3>
                      <div className="space-y-1.5 text-sm">
                        {stats.topDomains.map((domain, index) => (
                          <div
                            key={domain.domain}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-slate-200">
                                {index + 1}
                              </div>
                              <span className="text-slate-100">
                                {domain.domain}
                              </span>
                            </div>
                            <Badge className="bg-white/10 text-[10px] text-slate-200">
                              {domain.count}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {stats.topTags.length > 0 && (
                    <div>
                      <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <Hash className="h-3.5 w-3.5" />
                        Tags
                      </h3>
                      <div className="space-y-1.5 text-sm">
                        {stats.topTags.map((tag, index) => (
                          <div
                            key={tag.name}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-slate-200">
                                {index + 1}
                              </div>
                              <span className="text-slate-100">{tag.name}</span>
                            </div>
                            <Badge className="bg-white/10 text-[10px] text-slate-200">
                              {tag.count}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Bookmarks by Source */}
            {stats.bookmarksBySource.length > 0 && (
              <Card className="border border-white/10 bg-white/5 p-4 text-slate-100 backdrop-blur-sm">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
                  How You Save
                </h2>
                <div className="space-y-1.5 text-sm">
                  {stats.bookmarksBySource.map((source) => (
                    <div
                      key={source.source || "unknown"}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 text-slate-100">
                        {getSourceIcon(source.source, "h-4 w-4")}
                        <span>{formatSourceName(source.source)}</span>
                      </div>
                      <Badge className="bg-white/10 text-[10px] text-slate-200">
                        {source.count}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Monthly Activity */}
            <Card className="border border-white/10 bg-white/5 p-4 text-slate-100 backdrop-blur-sm md:col-span-2 lg:col-span-3">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
                <Calendar className="h-4 w-4" />
                Your Year in Saves
              </h2>
              <div className="grid gap-2 text-xs md:grid-cols-2 lg:grid-cols-3">
                {stats.monthlyActivity.map((month) => (
                  <div key={month.month} className="flex items-center gap-2">
                    <div className="w-7 text-right text-[10px] text-slate-400">
                      {monthNames[month.month - 1]}
                    </div>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-300/70"
                        style={{
                          width: `${maxMonthlyCount > 0 ? (month.count / maxMonthlyCount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="w-7 text-[10px] text-slate-300">
                      {month.count}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Summary Stats */}
            <Card className="border border-white/10 bg-white/5 p-4 text-slate-100 backdrop-blur-sm md:col-span-2 lg:col-span-3">
              <div className="grid gap-3 text-center sm:grid-cols-3">
                <div className="rounded-lg bg-white/5 p-3">
                  <Heart className="mx-auto mb-1 h-4 w-4 text-rose-200" />
                  <p className="text-lg font-semibold">
                    {stats.totalFavorites}
                  </p>
                  <p className="text-[10px] text-slate-400">Favorites</p>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <Hash className="mx-auto mb-1 h-4 w-4 text-amber-200" />
                  <p className="text-lg font-semibold">{stats.totalTags}</p>
                  <p className="text-[10px] text-slate-400">Tags Created</p>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <Highlighter className="mx-auto mb-1 h-4 w-4 text-emerald-200" />
                  <p className="text-lg font-semibold">
                    {stats.totalHighlights}
                  </p>
                  <p className="text-[10px] text-slate-400">Highlights</p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 text-center sm:grid-cols-3">
                <div className="rounded-lg bg-white/5 p-3">
                  <Link className="mx-auto mb-1 h-4 w-4 text-slate-200" />
                  <p className="text-lg font-semibold">
                    {stats.bookmarksByType.link}
                  </p>
                  <p className="text-[10px] text-slate-400">Links</p>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <FileText className="mx-auto mb-1 h-4 w-4 text-slate-200" />
                  <p className="text-lg font-semibold">
                    {stats.bookmarksByType.text}
                  </p>
                  <p className="text-[10px] text-slate-400">Notes</p>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <BookOpen className="mx-auto mb-1 h-4 w-4 text-slate-200" />
                  <p className="text-lg font-semibold">
                    {stats.bookmarksByType.asset}
                  </p>
                  <p className="text-[10px] text-slate-400">Assets</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Footer */}
          <div className="pb-4 pt-1 text-center text-[10px] text-slate-500">
            Made with Karakeep
          </div>
        </div>
      </div>
    );
  },
);

WrappedContent.displayName = "WrappedContent";
