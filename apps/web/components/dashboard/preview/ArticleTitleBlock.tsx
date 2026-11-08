import { useEffect, useState } from "react";
import { formatLocalDate } from "@/lib/date-format";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkDisplayTitle,
  getSourceUrl,
} from "@karakeep/shared/utils/bookmarkUtils";

import { hostname } from "./SavedPageOverview";

const WORDS_READ_PER_MINUTE = 200;

function estimateReadingMinutes(html: string) {
  const words = html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_READ_PER_MINUTE));
}

/** Shares its cache entry with the article that ReaderView loads. */
export function useReadingMinutes(bookmarkId: string, enabled = true) {
  const api = useTRPC();
  const { data } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId,
        includeContent: true,
      },
      {
        enabled,
        select: (data) =>
          data.content.type == BookmarkTypes.LINK && data.content.htmlContent
            ? estimateReadingMinutes(data.content.htmlContent)
            : null,
      },
    ),
  );
  return data;
}

/** Set after mount, as the server doesn't know the reader's timezone. */
function useLocalDay(date: Date | null | undefined) {
  const { i18n } = useTranslation();
  const [day, setDay] = useState("");
  const time = date?.getTime();
  useEffect(() => {
    setDay(
      time === undefined
        ? ""
        : formatLocalDate(new Date(time), "PP", i18n.language),
    );
  }, [time, i18n.language]);
  return day;
}

/**
 * Whether the title has scrolled out of view, for the bars above an article.
 * Also sees a title scrolled out of an ancestor that scrolls by itself.
 */
export function useTitleScrolledAway(chromeHeight = 0) {
  const [title, setTitle] = useState<HTMLHeadingElement | null>(null);
  const [isAway, setIsAway] = useState(false);
  useEffect(() => {
    if (!title) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsAway(!entry.isIntersecting),
      { rootMargin: `-${chromeHeight}px 0px 0px 0px` },
    );
    observer.observe(title);
    return () => {
      observer.disconnect();
      setIsAway(false);
    };
  }, [title, chromeHeight]);
  return { titleRef: setTitle, isTitleAway: isAway };
}

/**
 * The title, source and byline at the top of a reading column. Sizes itself in
 * em, so it follows the font size set on the column around it.
 */
export default function ArticleTitleBlock({
  bookmark,
  compactOnPhone,
  titleRef,
}: {
  bookmark: ZBookmark;
  compactOnPhone?: boolean;
  titleRef?: (title: HTMLHeadingElement | null) => void;
}) {
  const { t } = useTranslation();
  const { settings } = useReaderSettings();
  const link =
    bookmark.content.type == BookmarkTypes.LINK ? bookmark.content : null;
  const readingMinutes = useReadingMinutes(bookmark.id, !!link);
  const publishedDay = useLocalDay(link?.datePublished);
  const sourceUrl = getSourceUrl(bookmark);
  const details = [
    sourceUrl && (
      <a
        key="source"
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={t("preview.view_original")}
        className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11"
      >
        {hostname(sourceUrl)}
        <ExternalLink className="size-4" />
      </a>
    ),
    link?.author && t("preview.by_author", { author: link.author }),
    publishedDay && t("preview.published_on", { date: publishedDay }),
    readingMinutes && t("preview.reading_time", { minutes: readingMinutes }),
  ].filter(Boolean);

  return (
    <header
      className={cn(
        "mb-8 space-y-4 lining-nums",
        compactOnPhone && "max-sm:mb-4 max-sm:space-y-1",
      )}
    >
      <h1
        ref={titleRef}
        className={cn(
          "break-words text-[2.25em] font-semibold max-sm:text-[1.875em]",
          compactOnPhone && "max-sm:text-[1.5em]",
        )}
        style={{ lineHeight: settings.lineHeight * 0.8 }}
      >
        {getBookmarkDisplayTitle(bookmark) ?? t("common.untitled")}
      </h1>
      {details.length > 0 && (
        // Every item leads with its dot, and the row starts a dot's width to the
        // left of the clipped edge, so the dot opening each line is cut off. The
        // 4px left inside the edge is room for the link's focus ring.
        <div className="-ml-1 overflow-x-clip pl-1">
          <div className="-ml-5 flex flex-wrap items-center gap-y-1 font-sans text-sm text-muted-foreground max-sm:gap-y-0">
            {details.map((detail, i) => (
              <span key={i} className="flex min-w-0 items-center">
                <span aria-hidden className="w-5 shrink-0 text-center">
                  ·
                </span>
                {detail}
              </span>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
