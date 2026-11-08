"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

export default function SummaryProcessingPanel({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const { data, error, refetch } = useQuery(
    api.bookmarks.getSummaryProcessing.queryOptions(
      { bookmarkId: bookmark.id },
      {
        enabled: bookmark.content.type === BookmarkTypes.LINK,
        refetchInterval: (query) =>
          query.state.data?.processing?.status === "pending" ||
          query.state.data?.processing?.taggingStatus === "pending" ||
          bookmark.summarizationStatus === "pending" ||
          (bookmark.content.type === BookmarkTypes.LINK &&
            bookmark.content.crawlStatus === "pending")
            ? 2000
            : false,
      },
    ),
  );
  const processing = data?.processing;
  const status = processing?.status;
  const generatedAt = processing?.generatedAt?.getTime();
  const taggingStatus = processing?.taggingStatus;
  useEffect(() => {
    if (status === "success" || status === "failure")
      void queryClient.invalidateQueries({
        queryKey: api.bookmarks.getBookmark.queryKey({
          bookmarkId: bookmark.id,
        }),
      });
  }, [status, generatedAt, taggingStatus, api, bookmark.id, queryClient]);
  const retry = useMutation(
    api.bookmarks.retrySummary.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: api.bookmarks.getSummaryProcessing.queryKey({
              bookmarkId: bookmark.id,
            }),
          }),
          queryClient.invalidateQueries({
            queryKey: api.bookmarks.getBookmark.queryKey({
              bookmarkId: bookmark.id,
            }),
          }),
        ]);
      },
    }),
  );
  if (bookmark.content.type !== BookmarkTypes.LINK || data?.enabled === false)
    return null;
  if (!data && !error) return null;
  const waiting = processing?.stage === "retry_wait";
  const busy = status === "pending" && !waiting;
  const stage = processing?.stage ?? "idle";
  const date = (value: Date) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(value);
  const Icon = busy
    ? Loader2
    : status === "success"
      ? CheckCircle2
      : status === "failure" || error
        ? AlertCircle
        : Sparkles;

  return (
    <section
      aria-label={t("summary_processing.title")}
      className="shrink-0 rounded-lg border bg-muted/30 p-3 text-sm"
      data-testid="summary-processing"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2"
        >
          <Icon className={`size-4 shrink-0 ${busy ? "animate-spin" : ""}`} />
          <span className="font-medium">
            {error
              ? t("summary_processing.status_unavailable")
              : t(`summary_processing.stage.${stage}`, {
                  provider:
                    processing?.provider === "hermes" ? "Hermes" : "NotebookLM",
                })}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || retry.isPending}
          onClick={() =>
            error ? void refetch() : retry.mutate({ bookmarkId: bookmark.id })
          }
        >
          <RefreshCw
            className={`mr-2 size-3.5 ${retry.isPending ? "animate-spin" : ""}`}
          />
          {t(
            status === "success"
              ? "summary_processing.regenerate"
              : processing
                ? "summary_processing.retry"
                : "summary_processing.generate",
          )}
        </Button>
      </div>
      {processing && (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {processing.taggingStatus && (
            <p>{t(`summary_processing.tags.${processing.taggingStatus}`)}</p>
          )}
          {processing.taggingErrorCode && (
            <p>
              {processing.taggingErrorCode === "invalid_response"
                ? t("summary_processing.tags.invalid_response")
                : t("summary_processing.hermes_error", {
                    reason: t(
                      `summary_processing.errors.${processing.taggingErrorCode}`,
                    ),
                  })}
            </p>
          )}
          {processing.notebookErrorCode && (
            <p>
              {t("summary_processing.notebook_error", {
                reason: t(
                  `summary_processing.errors.${processing.notebookErrorCode}`,
                ),
              })}
            </p>
          )}
          {processing.hermesErrorCode && (
            <p>
              {t("summary_processing.hermes_error", {
                reason: t(
                  `summary_processing.errors.${processing.hermesErrorCode}`,
                ),
              })}
            </p>
          )}
          {processing.errorCode &&
            processing.errorCode !== processing.notebookErrorCode &&
            processing.errorCode !== processing.hermesErrorCode && (
              <p>{t(`summary_processing.errors.${processing.errorCode}`)}</p>
            )}
          {processing.retryCount > 0 && (
            <p>
              {t("summary_processing.retries", {
                count: processing.retryCount,
              })}
            </p>
          )}
          {processing.nextRetryAt && (
            <p>
              {t("summary_processing.next_retry", {
                time: date(processing.nextRetryAt),
              })}
            </p>
          )}
          {status === "success" && processing.generatedAt && (
            <p>
              {t("summary_processing.created", {
                time: date(processing.generatedAt),
              })}
            </p>
          )}
          {status === "pending" && <p>{t("summary_processing.original")}</p>}
          {status === "success" && (
            <p>{t("summary_processing.offline_hint")}</p>
          )}
        </div>
      )}
      {retry.isError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {t("summary_processing.queue_failed")}
        </p>
      )}
    </section>
  );
}
