"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  MaintenanceError,
  MaintenanceSearch,
  SelectionCheckbox,
} from "@/components/settings/Maintenance";
import { RowActionsMenu } from "@/components/settings/RowActions";
import {
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsPage";
import {
  ActionButton,
  ActionButtonWithTooltip,
} from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import FormattedDate from "@/components/ui/formatted-date";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { toast } from "@/components/ui/sonner";
import {
  stackedTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getBrokenLinkIssue,
  getLinkHostname,
  stripUrlProtocol,
} from "@/lib/broken-links";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  ExternalLink,
  Link2Off,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { limitConcurrency } from "@karakeep/shared/concurrency";
import { MAX_CONCURRENT_BULK_ACTIONS } from "@/lib/hooks/useBookmarkBulkActions";

const categories = ["all", "blocked", "missing", "errors"] as const;
const categoryIcons = {
  all: CircleAlert,
  blocked: ShieldAlert,
  missing: Link2Off,
  errors: CircleHelp,
};
type Category = (typeof categories)[number];
const issueClass = {
  blocked: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  missing: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  server: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  failed: "bg-muted text-muted-foreground",
  http: "bg-muted text-muted-foreground",
};

function IssueBadge({ statusCode }: { statusCode: number | null }) {
  const { t } = useTranslation();
  const issue = getBrokenLinkIssue(statusCode);
  return (
    <span
      title={t(`settings.broken_links.issue_${issue}_hint`)}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
        issueClass[issue],
      )}
    >
      {statusCode !== null && (statusCode < 200 || statusCode >= 300) && (
        <span className="font-mono">{statusCode}</span>
      )}
      {t(`settings.broken_links.issue_${issue}`)}
    </span>
  );
}

export default function BrokenLinksPage() {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort] = useState<"recent" | "oldest" | "domain">("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string[]>([]);
  const { data, isPending, isError, refetch } = useQuery(
    api.bookmarks.getBrokenLinks.queryOptions(undefined, {
      refetchInterval: (query) =>
        query.state.data?.bookmarks.some((bookmark) => bookmark.isCrawling)
          ? 10000
          : false,
    }),
  );
  const { mutateAsync: recrawl } = useMutation(
    api.bookmarks.recrawlBookmark.mutationOptions(),
  );
  const { mutateAsync: remove } = useMutation(
    api.bookmarks.deleteBookmark.mutationOptions(),
  );
  const bookmarks = data?.bookmarks ?? [];
  const counts = useMemo(() => {
    const result = { all: bookmarks.length, blocked: 0, missing: 0, errors: 0 };
    for (const bookmark of bookmarks) {
      const issue = getBrokenLinkIssue(bookmark.statusCode);
      result[issue === "blocked" || issue === "missing" ? issue : "errors"]++;
    }
    return result;
  }, [bookmarks]);
  const searchQuery = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      bookmarks
        .filter((bookmark) => {
          const issue = getBrokenLinkIssue(bookmark.statusCode);
          return (
            (category === "all" ||
              (category === "errors"
                ? issue !== "blocked" && issue !== "missing"
                : issue === category)) &&
            (!searchQuery ||
              `${bookmark.title ?? ""} ${bookmark.url}`
                .toLowerCase()
                .includes(searchQuery))
          );
        })
        .sort((a, b) =>
          sort === "domain"
            ? getLinkHostname(a.url).localeCompare(getLinkHostname(b.url))
            : sort === "oldest"
              ? (a.crawledAt?.getTime() ?? 0) - (b.crawledAt?.getTime() ?? 0)
              : (b.crawledAt?.getTime() ?? 0) - (a.crawledAt?.getTime() ?? 0),
        ),
    [bookmarks, category, searchQuery, sort],
  );
  const selection = filtered.filter((bookmark) => selected.has(bookmark.id));
  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const hasFilters = !!searchQuery || category !== "all";
  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setSelected(new Set());
  };

  async function runAction(ids: string[], action: "retry" | "delete") {
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        limitConcurrency(
          ids.map(
            (id) => () =>
              action === "retry"
                ? recrawl({ bookmarkId: id })
                : remove({ bookmarkId: id }),
          ),
          MAX_CONCURRENT_BULK_ACTIONS,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries(api.bookmarks.pathFilter()),
        ...(action === "delete"
          ? [
              queryClient.invalidateQueries(api.assets.list.pathFilter()),
              queryClient.invalidateQueries(api.lists.stats.pathFilter()),
            ]
          : []),
      ]);
      const failedIds = ids.filter(
        (_, index) => results[index].status === "rejected",
      );
      const failed = failedIds.length;
      setSelected(new Set(failedIds));
      if (action === "delete") setDeleting(failedIds);
      toast({
        description: failed
          ? t("settings.broken_links.action_failed", {
              count: failed,
              total: ids.length,
            })
          : t(
              action === "retry"
                ? "settings.broken_links.queued_count"
                : "settings.broken_links.deleted_count",
              { count: ids.length - failed },
            ),
        variant: failed ? "destructive" : "default",
      });
    } finally {
      setBusy(false);
    }
  }

  // Nothing to review or filter, so there's only the good news to show.
  if (data && bookmarks.length === 0 && !hasFilters) {
    return (
      <SettingsPage
        title={t("settings.broken_links.broken_links")}
        description={t("settings.broken_links.description")}
      >
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheck />
            </EmptyMedia>
            <EmptyTitle>{t("settings.broken_links.empty")}</EmptyTitle>
            <EmptyDescription>
              {t("settings.broken_links.empty_description")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title={t("settings.broken_links.broken_links")}
      description={t("settings.broken_links.description")}
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {categories.map((value) => (
          <StatTile
            key={value}
            label={t(`settings.broken_links.category_${value}`)}
            icon={categoryIcons[value]}
            value={data ? counts[value] : "—"}
            helper={t(`settings.broken_links.category_${value}_hint`)}
            loading={isPending}
            pressed={category === value}
            onClick={() => {
              setCategory(value);
              setSelected(new Set());
            }}
          />
        ))}
      </div>
      {counts.blocked > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-muted-foreground">
            {t("settings.broken_links.blocked_hint")}
          </p>
        </div>
      )}
      <SettingsSection>
        <div className="flex flex-col gap-3 sm:flex-row">
          <MaintenanceSearch
            aria-label={t("settings.broken_links.search")}
            placeholder={t("settings.broken_links.search")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelected(new Set());
            }}
          />
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as typeof sort)}
          >
            <SelectTrigger
              className="w-full sm:w-48"
              aria-label={t("settings.maintenance.sort")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["recent", "oldest", "domain"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`settings.broken_links.sort_${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 text-sm">
          <p
            className="flex items-center gap-2 text-muted-foreground"
            aria-live="polite"
          >
            {/* The table header, and its select-all box, is hidden on phones. */}
            {filtered.length > 0 && (
              <SelectionCheckbox
                className="lg:hidden"
                aria-label={t("settings.broken_links.select_visible")}
                checked={selection.length === filtered.length}
                indeterminate={
                  selection.length > 0 && selection.length < filtered.length
                }
                disabled={busy}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? new Set(filtered.map((bookmark) => bookmark.id))
                      : new Set(),
                  )
                }
              />
            )}
            {selection.length
              ? t("settings.maintenance.selected", { count: selection.length })
              : t("settings.broken_links.result_count", {
                  count: filtered.length,
                })}
          </p>
          <div className="flex flex-wrap gap-2">
            {selection.length > 0 ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setSelected(new Set())}
                >
                  {t("settings.maintenance.clear_selection")}
                </Button>
                <ActionButton
                  variant="outline"
                  size="sm"
                  loading={busy && deleting.length === 0}
                  disabled={busy || !selection.length}
                  onClick={() =>
                    void runAction(
                      selection.map((bookmark) => bookmark.id),
                      "retry",
                    )
                  }
                >
                  <RefreshCw className="size-4" />
                  {t("settings.broken_links.retry_selected")}
                </ActionButton>
                <Button
                  variant="ghostDestructive"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    setDeleting(selection.map((bookmark) => bookmark.id))
                  }
                >
                  <Trash2 className="size-4" />
                  {t("settings.maintenance.delete_selected")}
                </Button>
              </>
            ) : (
              hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  {t("settings.maintenance.clear_filters")}
                </Button>
              )
            )}
          </div>
        </div>
        {isError ? (
          <MaintenanceError onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !filtered.length ? (
          <Empty className="p-4 md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Link2Off />
              </EmptyMedia>
              <EmptyTitle className="text-base">
                {t("settings.maintenance.no_matches")}
              </EmptyTitle>
              <EmptyDescription>
                {t("settings.maintenance.adjust_filters")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("settings.maintenance.clear_filters")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Table inCard className={stackedTable.table}>
            <TableHeader className={stackedTable.header}>
              <TableRow>
                <TableHead className="w-10 pr-0">
                  <SelectionCheckbox
                    aria-label={t("settings.broken_links.select_visible")}
                    checked={
                      selection.length === filtered.length &&
                      filtered.length > 0
                    }
                    indeterminate={
                      selection.length > 0 && selection.length < filtered.length
                    }
                    disabled={busy}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? new Set(filtered.map((bookmark) => bookmark.id))
                          : new Set(),
                      )
                    }
                  />
                </TableHead>
                <TableHead>{t("settings.broken_links.bookmark")}</TableHead>
                <TableHead>{t("settings.broken_links.issue")}</TableHead>
                <TableHead className="whitespace-nowrap">
                  {t("settings.broken_links.last_crawled_at")}
                </TableHead>
                <TableHead>
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={stackedTable.body}>
              {filtered.map((bookmark) => {
                const isCrawling = bookmark.isCrawling;
                return (
                  <TableRow
                    key={bookmark.id}
                    className={cn(
                      "relative block h-auto py-3 pe-6 ps-14 lg:table-row lg:h-14 lg:p-0",
                      selection.length > 0 && !busy && "cursor-pointer",
                    )}
                    data-state={
                      selected.has(bookmark.id) ? "selected" : undefined
                    }
                    // Once selecting, a row is the target: a thumb shouldn't
                    // have to find the checkbox for each one.
                    onClick={(event) => {
                      if (
                        selection.length > 0 &&
                        !busy &&
                        !(event.target as Element).closest(
                          "a, button, input, label",
                        )
                      ) {
                        toggleSelected(bookmark.id);
                      }
                    }}
                  >
                    <TableCell className="absolute start-6 top-3.5 p-0 lg:static lg:table-cell lg:py-2 lg:pe-0">
                      <SelectionCheckbox
                        aria-label={t("settings.maintenance.select_item", {
                          name: bookmark.title || bookmark.url,
                        })}
                        checked={selected.has(bookmark.id)}
                        disabled={busy}
                        onChange={() => toggleSelected(bookmark.id)}
                      />
                    </TableCell>
                    <TableCell className="block p-0 pe-20 max-sm:pe-24 lg:table-cell lg:w-full lg:max-w-0 lg:px-3 lg:py-2">
                      <Link
                        href={`/dashboard/preview/${bookmark.id}`}
                        prefetch={false}
                        className="block truncate font-medium hover:underline"
                        title={bookmark.title || bookmark.url}
                      >
                        {bookmark.title || getLinkHostname(bookmark.url)}
                      </Link>
                      <a
                        href={bookmark.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        title={bookmark.url}
                      >
                        <span className="truncate">
                          {stripUrlProtocol(bookmark.url)}
                        </span>
                        <ArrowUpRight className="size-3 shrink-0" />
                      </a>
                    </TableCell>
                    <TableCell className="inline-block whitespace-nowrap p-0 pe-3 pt-2 lg:table-cell lg:px-3 lg:py-2">
                      <IssueBadge statusCode={bookmark.statusCode} />
                    </TableCell>
                    <TableCell className="inline-block whitespace-nowrap p-0 pt-2 text-xs text-muted-foreground lg:table-cell lg:px-3 lg:py-2">
                      {bookmark.crawledAt ? (
                        <FormattedDate
                          date={bookmark.crawledAt}
                          formatStr="PP"
                        />
                      ) : (
                        t("settings.broken_links.never_crawled")
                      )}
                    </TableCell>
                    <TableCell className="absolute end-6 top-1.5 p-0 lg:static lg:table-cell lg:px-3 lg:py-2">
                      <div className="flex items-center gap-1">
                        <ActionButtonWithTooltip
                          variant="ghost"
                          size="sm"
                          loading={false}
                          disabled={busy || isCrawling}
                          onClick={() => void runAction([bookmark.id], "retry")}
                          tooltip={t(
                            isCrawling
                              ? "settings.broken_links.queued"
                              : "actions.recrawl",
                          )}
                          aria-label={t(
                            isCrawling
                              ? "settings.broken_links.queued"
                              : "actions.recrawl",
                          )}
                          className={cn(
                            "gap-2 px-2 max-lg:size-8 max-sm:size-11 lg:px-3",
                            isCrawling && "text-teal-600 dark:text-teal-400",
                          )}
                        >
                          {isCrawling ? (
                            <Check className="size-4" />
                          ) : (
                            <RefreshCw className="size-4" />
                          )}
                          <span className="hidden lg:inline">
                            {t(
                              isCrawling
                                ? "settings.broken_links.queued"
                                : "actions.recrawl",
                            )}
                          </span>
                        </ActionButtonWithTooltip>
                        <RowActionsMenu
                          label={t("common.actions_for", {
                            name: bookmark.title || bookmark.url,
                          })}
                          items={[
                            {
                              label: t("settings.manage_assets.view_bookmark"),
                              icon: <ExternalLink className="size-4" />,
                              href: `/dashboard/preview/${bookmark.id}`,
                            },
                            {
                              label: t("actions.delete"),
                              icon: <Trash2 className="size-4" />,
                              destructive: true,
                              disabled: busy,
                              onSelect: () => setDeleting([bookmark.id]),
                            },
                          ]}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SettingsSection>
      <ActionConfirmingDialog
        open={deleting.length > 0}
        setOpen={(open) => {
          if (!open && !busy) setDeleting([]);
        }}
        title={t("settings.broken_links.delete_title", {
          count: deleting.length,
        })}
        description={
          <p className="text-sm text-muted-foreground">
            {t("settings.broken_links.delete_description")}
          </p>
        }
        actionButton={() => (
          <ActionButton
            variant="destructive"
            loading={busy}
            onClick={() => void runAction(deleting, "delete")}
          >
            {t("actions.delete")}
          </ActionButton>
        )}
      />
    </SettingsPage>
  );
}
