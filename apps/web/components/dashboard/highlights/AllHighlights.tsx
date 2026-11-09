"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import useRelativeTime from "@/lib/hooks/relative-time";
import { cn } from "@/lib/utils";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Check, Highlighter, ListFilter, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";

import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  SUPPORTED_HIGHLIGHT_COLORS,
  ZGetAllHighlightsResponse,
  ZHighlightColor,
  ZHighlightWithBookmark,
} from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "../preview/highlights";
import { ICON_CONTROL_CLASS, IconTooltip } from "../preview/IconControl";
import { hostname } from "../preview/SavedPageOverview";
import HighlightCard from "./HighlightCard";

function HighlightWithTime({
  highlight,
}: {
  highlight: ZHighlightWithBookmark;
}) {
  const { i18n } = useTranslation();
  const { fromNow, localCreatedAt } = useRelativeTime(
    highlight.createdAt,
    i18n.language,
  );
  return (
    <HighlightCard
      highlight={highlight}
      clickable={false}
      href={`/reader/${highlight.bookmarkId}?highlight=${highlight.id}`}
      readOnly={false}
      meta={
        <span className="text-xs text-muted-foreground" title={localCreatedAt}>
          {fromNow}
        </span>
      }
    />
  );
}

function ArticleLink({
  bookmarkId,
  bookmark,
}: {
  bookmarkId: string;
  bookmark: ZHighlightWithBookmark["bookmark"];
}) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/dashboard/preview/${bookmarkId}`}
      className="flex min-w-0 flex-col rounded-sm outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="truncate text-sm font-medium text-foreground">
        {bookmark.title || t("common.untitled")}
      </span>
      {bookmark.url && (
        <span
          className="truncate text-xs text-muted-foreground"
          title={bookmark.url}
        >
          {hostname(bookmark.url)}
        </span>
      )}
    </Link>
  );
}

function ColorFilter({
  value,
  onChange,
}: {
  value: ZHighlightColor | undefined;
  onChange: (color: ZHighlightColor | undefined) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("highlights.filter_by_color")}
      className="flex shrink-0 items-center gap-0.5"
    >
      <span className="mr-1 text-sm text-muted-foreground" aria-hidden>
        {t("highlights.color")}
      </span>
      {SUPPORTED_HIGHLIGHT_COLORS.map((color) => {
        const label = t(`highlights.color_names.${color}`);
        const selected = value === color;
        return (
          <IconTooltip key={color} label={label}>
            <Button
              variant="ghost"
              size="none"
              aria-label={label}
              aria-pressed={selected}
              className={cn(ICON_CONTROL_CLASS, selected && "bg-accent")}
              onClick={() => onChange(selected ? undefined : color)}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full ring-1 ring-inset ring-foreground/10",
                  HIGHLIGHT_COLOR_MAP.swatch[color],
                  selected && "ring-2 ring-foreground/70",
                )}
              >
                {selected && (
                  <Check className="size-3 text-foreground dark:text-background" />
                )}
              </span>
            </Button>
          </IconTooltip>
        );
      })}
    </div>
  );
}

export default function AllHighlights({
  highlights: initialHighlights,
}: {
  highlights: ZGetAllHighlightsResponse;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState("");
  const [color, setColor] = useState<ZHighlightColor>();
  const debouncedSearch = useDebounce(searchInput, 300);

  // Use search endpoint if searchQuery is provided, otherwise use getAll
  const useSearchQuery = debouncedSearch.trim().length > 0;

  const getAllQuery = useInfiniteQuery(
    api.highlights.getAll.infiniteQueryOptions(
      { color },
      {
        enabled: !useSearchQuery,
        placeholderData: keepPreviousData,
        initialData:
          !useSearchQuery && !color
            ? () => ({
                pages: [initialHighlights],
                pageParams: [null],
              })
            : undefined,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  const searchQueryResult = useInfiniteQuery(
    api.highlights.search.infiniteQueryOptions(
      { text: debouncedSearch, color },
      {
        enabled: useSearchQuery,
        placeholderData: keepPreviousData,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSearchQuery ? searchQueryResult : getAllQuery;

  const { ref: loadMoreRef, inView: loadMoreButtonInView } = useInView();
  useEffect(() => {
    if (loadMoreButtonInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [loadMoreButtonInView]);

  const allHighlights = useMemo(
    () => data?.pages.flatMap((p) => p.highlights),
    [data],
  );

  // Consecutive highlights from one article share a header. The list stays in
  // the server's order, so an article can appear again further down.
  const groups = useMemo(() => {
    const result: {
      bookmarkId: string;
      bookmark: ZHighlightWithBookmark["bookmark"];
      highlights: ZHighlightWithBookmark[];
    }[] = [];
    for (const highlight of allHighlights ?? []) {
      const last = result[result.length - 1];
      if (last?.bookmarkId === highlight.bookmarkId) {
        last.highlights.push(highlight);
      } else {
        result.push({
          bookmarkId: highlight.bookmarkId,
          bookmark: highlight.bookmark,
          highlights: [highlight],
        });
      }
    }
    return result;
  }, [allHighlights]);

  const isUnfilteredEmpty =
    !searchInput && !useSearchQuery && !color && allHighlights?.length === 0;

  if (isUnfilteredEmpty) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Highlighter />
          </EmptyMedia>
          <EmptyTitle>{t("highlights.empty_title")}</EmptyTitle>
          <EmptyDescription>
            {t("highlights.empty_description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-x-3 gap-y-1 max-sm:flex-wrap">
        <Input
          variant="filled"
          type="text"
          aria-label={t("highlights.filter_label")}
          placeholder={t("highlights.filter_placeholder")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          startIcon={<ListFilter className="size-4 text-muted-foreground" />}
          endIcon={
            searchInput && (
              <IconTooltip label={t("highlights.clear_filter")}>
                <button
                  aria-label={t("highlights.clear_filter")}
                  onClick={() => setSearchInput("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </IconTooltip>
            )
          }
          className={cn("w-full", !searchInput && "pr-2")}
        />
        <ColorFilter value={color} onChange={setColor} />
      </div>

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <section
            key={`${group.bookmarkId}-${group.highlights[0].id}`}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4"
          >
            <ArticleLink
              bookmarkId={group.bookmarkId}
              bookmark={group.bookmark}
            />
            {group.highlights.map((highlight) => (
              <HighlightWithTime key={highlight.id} highlight={highlight} />
            ))}
          </section>
        ))}
        {allHighlights?.length === 0 && (
          <Empty className="p-4 md:p-6">
            <EmptyHeader>
              <EmptyTitle className="text-base">
                {t("highlights.no_matches")}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {hasNextPage && (
          <div className="flex justify-center">
            <ActionButton
              ref={loadMoreRef}
              ignoreDemoMode={true}
              loading={isFetchingNextPage}
              onClick={() => fetchNextPage()}
              variant="ghost"
            >
              {t("actions.load_more")}
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
