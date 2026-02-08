"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDeleteImportSession,
  useImportSessionResults,
  useImportSessionStats,
  usePauseImportSession,
  useResumeImportSession,
} from "@/lib/hooks/useImportSessions";
import { useTranslation } from "@/lib/i18n/client";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Paperclip,
  Pause,
  Play,
  Trash2,
  Upload,
} from "lucide-react";
import { useInView } from "react-intersection-observer";

import type { ZImportSessionStatus } from "@karakeep/shared/types/importSessions";
import { switchCase } from "@karakeep/shared/utils/switch";

type FilterType =
  | "all"
  | "accepted"
  | "rejected"
  | "skipped_duplicate"
  | "pending";

type SimpleTFunction = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface ImportSessionResultItem {
  id: string;
  title: string | null;
  url: string | null;
  content: string | null;
  type: string;
  status: string;
  result: string | null;
  resultReason: string | null;
  resultBookmarkId: string | null;
}

function getStatusColor(status: string) {
  switch (status) {
    case "staging":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    case "pending":
      return "bg-muted text-muted-foreground";
    case "running":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "paused":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
    case "completed":
      return "bg-green-500/10 text-green-700 dark:text-green-400";
    case "failed":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "staging":
      return <Upload className="h-4 w-4" />;
    case "pending":
      return <Clock className="h-4 w-4" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case "paused":
      return <Pause className="h-4 w-4" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4" />;
    case "failed":
      return <AlertCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function getResultBadge(
  status: string,
  result: string | null,
  t: (key: string) => string,
) {
  if (status === "pending") {
    return (
      <Badge
        variant="secondary"
        className="bg-muted text-muted-foreground hover:bg-muted"
      >
        <Clock className="mr-1 h-3 w-3" />
        {t("settings.import_sessions.detail.result_pending")}
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge
        variant="secondary"
        className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/10 dark:text-blue-400"
      >
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        {t("settings.import_sessions.detail.result_processing")}
      </Badge>
    );
  }
  switch (result) {
    case "accepted":
      return (
        <Badge
          variant="secondary"
          className="bg-green-500/10 text-green-700 hover:bg-green-500/10 dark:text-green-400"
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {t("settings.import_sessions.detail.result_accepted")}
        </Badge>
      );
    case "rejected":
      return (
        <Badge
          variant="secondary"
          className="bg-destructive/10 text-destructive hover:bg-destructive/10"
        >
          <AlertCircle className="mr-1 h-3 w-3" />
          {t("settings.import_sessions.detail.result_rejected")}
        </Badge>
      );
    case "skipped_duplicate":
      return (
        <Badge
          variant="secondary"
          className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
        >
          {t("settings.import_sessions.detail.result_skipped_duplicate")}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="bg-muted hover:bg-muted">
          —
        </Badge>
      );
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "link":
      return <Globe className="h-3 w-3" />;
    case "text":
      return <FileText className="h-3 w-3" />;
    case "asset":
      return <Paperclip className="h-3 w-3" />;
    default:
      return null;
  }
}

function getTypeLabel(type: string, t: SimpleTFunction) {
  switch (type) {
    case "link":
      return t("common.bookmark_types.link");
    case "text":
      return t("common.bookmark_types.text");
    case "asset":
      return t("common.bookmark_types.media");
    default:
      return type;
  }
}

function getTitleDisplay(
  item: {
    title: string | null;
    url: string | null;
    content: string | null;
    type: string;
  },
  noTitleLabel: string,
) {
  if (item.title) {
    return item.title;
  }
  if (item.type === "text" && item.content) {
    return item.content.length > 80
      ? item.content.substring(0, 80) + "…"
      : item.content;
  }
  if (item.url) {
    try {
      const url = new URL(item.url);
      const display = url.hostname + url.pathname;
      return display.length > 60 ? display.substring(0, 60) + "…" : display;
    } catch {
      return item.url.length > 60 ? item.url.substring(0, 60) + "…" : item.url;
    }
  }
  return noTitleLabel;
}

export default function ImportSessionDetail({
  sessionId,
}: {
  sessionId: string;
}) {
  const { t: tRaw } = useTranslation();
  const t = tRaw as SimpleTFunction;
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: stats, isLoading: isStatsLoading } =
    useImportSessionStats(sessionId);
  const {
    data: resultsData,
    isLoading: isResultsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useImportSessionResults(sessionId, filter);

  const deleteSession = useDeleteImportSession();
  const pauseSession = usePauseImportSession();
  const resumeSession = useResumeImportSession();

  const { ref: loadMoreRef, inView: loadMoreInView } = useInView();

  useEffect(() => {
    if (loadMoreInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, loadMoreInView]);

  if (isStatsLoading) {
    return <FullPageSpinner />;
  }

  if (!stats) {
    return null;
  }

  const items: ImportSessionResultItem[] =
    resultsData?.pages.flatMap((page) => page.items) ?? [];

  const progress =
    stats.totalBookmarks > 0
      ? ((stats.completedBookmarks + stats.failedBookmarks) /
          stats.totalBookmarks) *
        100
      : 0;

  const canDelete =
    stats.status === "completed" ||
    stats.status === "failed" ||
    stats.status === "paused";
  const canPause = stats.status === "pending" || stats.status === "running";
  const canResume = stats.status === "paused";

  const statusLabels = (s: ZImportSessionStatus) =>
    switchCase(s, {
      staging: t("settings.import_sessions.status.staging"),
      pending: t("settings.import_sessions.status.pending"),
      running: t("settings.import_sessions.status.running"),
      paused: t("settings.import_sessions.status.paused"),
      completed: t("settings.import_sessions.status.completed"),
      failed: t("settings.import_sessions.status.failed"),
    });

  const handleDelete = () => {
    deleteSession.mutateAsync({ importSessionId: sessionId }).then(() => {
      router.push("/settings/import");
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <Link
        href="/settings/import"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("settings.import_sessions.detail.back_to_import")}
      </Link>

      {/* Header */}
      <div className="rounded-md border bg-background p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-medium">{stats.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("settings.import_sessions.created_at", {
                  time: formatDistanceToNow(stats.createdAt, {
                    addSuffix: true,
                  }),
                })}
              </p>
            </div>
            <Badge
              className={`${getStatusColor(stats.status)} hover:bg-inherit`}
            >
              {getStatusIcon(stats.status)}
              <span className="ml-1 capitalize">
                {statusLabels(stats.status)}
              </span>
            </Badge>
          </div>

          {/* Progress bar + stats */}
          {stats.totalBookmarks > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t("settings.import_sessions.progress")}
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {stats.completedBookmarks + stats.failedBookmarks} /{" "}
                    {stats.totalBookmarks}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(progress)}%
                  </Badge>
                </div>
              </div>
              <Progress value={progress} className="h-3" />
              <div className="flex flex-wrap gap-2">
                {stats.completedBookmarks > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-green-500/10 text-green-700 hover:bg-green-500/10 dark:text-green-400"
                  >
                    <CheckCircle2 className="mr-1.5 h-3 w-3" />
                    {t("settings.import_sessions.badges.completed", {
                      count: stats.completedBookmarks,
                    })}
                  </Badge>
                )}
                {stats.failedBookmarks > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-destructive/10 text-destructive hover:bg-destructive/10"
                  >
                    <AlertCircle className="mr-1.5 h-3 w-3" />
                    {t("settings.import_sessions.badges.failed", {
                      count: stats.failedBookmarks,
                    })}
                  </Badge>
                )}
                {stats.pendingBookmarks > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                  >
                    <Clock className="mr-1.5 h-3 w-3" />
                    {t("settings.import_sessions.badges.pending", {
                      count: stats.pendingBookmarks,
                    })}
                  </Badge>
                )}
                {stats.processingBookmarks > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/10 dark:text-blue-400"
                  >
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    {t("settings.import_sessions.badges.processing", {
                      count: stats.processingBookmarks,
                    })}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Message */}
          {stats.message && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground dark:bg-muted/20">
              {stats.message}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-2">
              {canPause && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    pauseSession.mutate({ importSessionId: sessionId })
                  }
                  disabled={pauseSession.isPending}
                >
                  <Pause className="mr-1 h-4 w-4" />
                  {t("settings.import_sessions.pause_session")}
                </Button>
              )}
              {canResume && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    resumeSession.mutate({ importSessionId: sessionId })
                  }
                  disabled={resumeSession.isPending}
                >
                  <Play className="mr-1 h-4 w-4" />
                  {t("settings.import_sessions.resume_session")}
                </Button>
              )}
              {canDelete && (
                <ActionConfirmingDialog
                  title={t("settings.import_sessions.delete_dialog_title")}
                  description={
                    <div>
                      {t("settings.import_sessions.delete_dialog_description", {
                        name: stats.name,
                      })}
                    </div>
                  }
                  actionButton={(setDialogOpen) => (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        handleDelete();
                        setDialogOpen(false);
                      }}
                      disabled={deleteSession.isPending}
                    >
                      {t("settings.import_sessions.delete_session")}
                    </Button>
                  )}
                >
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteSession.isPending}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {t("actions.delete")}
                  </Button>
                </ActionConfirmingDialog>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs + Results table */}
      <div className="rounded-md border bg-background p-4">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as FilterType)}
          className="w-full"
        >
          <TabsList className="mb-4 flex w-full flex-wrap">
            <TabsTrigger value="all">
              {t("settings.import_sessions.detail.filter_all")}
            </TabsTrigger>
            <TabsTrigger value="accepted">
              {t("settings.import_sessions.detail.filter_accepted")}
            </TabsTrigger>
            <TabsTrigger value="rejected">
              {t("settings.import_sessions.detail.filter_rejected")}
            </TabsTrigger>
            <TabsTrigger value="skipped_duplicate">
              {t("settings.import_sessions.detail.filter_duplicates")}
            </TabsTrigger>
            <TabsTrigger value="pending">
              {t("settings.import_sessions.detail.filter_pending")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {isResultsLoading ? (
          <FullPageSpinner />
        ) : items.length === 0 ? (
          <p className="rounded-md bg-muted p-4 text-center text-sm text-muted-foreground">
            {t("settings.import_sessions.detail.no_results")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("settings.import_sessions.detail.table_title")}
                  </TableHead>
                  <TableHead className="w-[80px]">
                    {t("settings.import_sessions.detail.table_type")}
                  </TableHead>
                  <TableHead className="w-[120px]">
                    {t("settings.import_sessions.detail.table_result")}
                  </TableHead>
                  <TableHead>
                    {t("settings.import_sessions.detail.table_reason")}
                  </TableHead>
                  <TableHead className="w-[100px]">
                    {t("settings.import_sessions.detail.table_bookmark")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[300px] truncate font-medium">
                      {getTitleDisplay(
                        item,
                        t("settings.import_sessions.detail.no_title"),
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="flex w-fit items-center gap-1 text-xs"
                      >
                        {getTypeIcon(item.type)}
                        {getTypeLabel(item.type, t)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {getResultBadge(item.status, item.result, t)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {item.resultReason || "—"}
                    </TableCell>
                    <TableCell>
                      {item.resultBookmarkId ? (
                        <Link
                          href={`/dashboard/preview/${item.resultBookmarkId}`}
                          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
                          prefetch={false}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t("settings.import_sessions.detail.view_bookmark")}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {hasNextPage && (
              <div className="flex justify-center">
                <ActionButton
                  ref={loadMoreRef}
                  ignoreDemoMode={true}
                  loading={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                  variant="ghost"
                >
                  {t("settings.import_sessions.detail.load_more")}
                </ActionButton>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
