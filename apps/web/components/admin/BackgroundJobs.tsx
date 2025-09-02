"use client";

import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { keepPreviousData } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  Globe,
  HelpCircle,
  Image,
  RefreshCw,
  Rss,
  Search,
  Sparkle,
  Video,
  Webhook,
} from "lucide-react";

import { Button } from "../ui/button";
import { AdminCard } from "./AdminCard";

interface JobStats {
  queued: number;
  pending?: number;
  failed?: number;
}

interface JobAction {
  label: string;
  onClick: () => Promise<void>;
  loading: boolean;
}

function JobStatusExplanation() {
  const { t } = useTranslation();

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-900/10">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg text-blue-900 dark:text-blue-200">
          <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          {t("admin.background_jobs.status.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-200">
                {t("admin.background_jobs.status.queued.title")}
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {t("admin.background_jobs.status.queued.description")}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center">
              <RefreshCw className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h4 className="font-medium text-yellow-900 dark:text-yellow-400">
                {t("admin.background_jobs.status.unprocessed.title")}
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-500">
                {t("admin.background_jobs.status.unprocessed.description")}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-500" />
            </div>
            <div>
              <h4 className="font-medium text-red-900 dark:text-red-500">
                {t("admin.background_jobs.status.failed.title")}
              </h4>
              <p className="text-sm text-red-700 dark:text-red-500">
                {t("admin.background_jobs.status.failed.description")}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function JobCardSkeleton() {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="mt-2 h-4 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-8" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-8" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-2 w-full" />
        </div>

        <div className="space-y-3 border-t pt-4">
          <Skeleton className="h-4 w-32" />
          <div className="grid gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function JobCard({
  title,
  icon: Icon,
  stats,
  description,
  actions = [],
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  stats: JobStats;
  description: string;
  actions?: JobAction[];
}) {
  const { t } = useTranslation();
  const total = stats.queued + (stats.pending || 0) + (stats.failed || 0);
  const hasActivity = total > 0;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon
              className={`h-5 w-5 ${hasActivity ? "text-primary" : "text-muted-foreground"}`}
            />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {hasActivity && (
            <Badge variant="secondary">
              <Activity className="mr-1 h-3 w-3" />
              {t("admin.background_jobs.active")}
            </Badge>
          )}
        </div>
        <CardDescription className="mt-2 text-sm">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="font-medium">
              {t("admin.background_jobs.status.queued.title")}
            </span>
            <Badge variant="outline">{stats.queued}</Badge>
          </div>
          {stats.pending !== undefined && (
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-yellow-500" />
              <span className="font-medium">
                {t("admin.background_jobs.status.unprocessed.title")}
              </span>
              <Badge variant="outline">{stats.pending}</Badge>
            </div>
          )}
          {stats.failed !== undefined && stats.failed > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="font-medium">
                {t("admin.background_jobs.status.failed.title")}
              </span>
              <Badge variant="outline">{stats.failed}</Badge>
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("admin.background_jobs.available_actions")}
            </h4>
            <div className="grid gap-2">
              {actions.map((action, index) => (
                <ActionConfirmingDialog
                  key={index}
                  title="Confirm Action"
                  description={`Are you sure you want to ${action.label.toLowerCase()}?`}
                  actionButton={(setDialogOpen) => (
                    <ActionButton
                      loading={action.loading}
                      onClick={async () => {
                        await action.onClick();
                        setDialogOpen(false);
                      }}
                      className="h-auto justify-start px-3 py-2.5 text-left text-sm"
                    >
                      {t("actions.confirm")}
                    </ActionButton>
                  )}
                >
                  <Button variant="secondary">{action.label}</Button>
                </ActionConfirmingDialog>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function useJobActions() {
  const { t } = useTranslation();

  const { mutateAsync: recrawlLinks, isPending: isRecrawlPending } =
    api.admin.recrawlLinks.useMutation({
      onSuccess: () => {
        toast({
          description: "Recrawl enqueued",
        });
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: e.message,
        });
      },
    });

  const { mutateAsync: reindexBookmarks, isPending: isReindexPending } =
    api.admin.reindexAllBookmarks.useMutation({
      onSuccess: () => {
        toast({
          description: "Reindex enqueued",
        });
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: e.message,
        });
      },
    });

  const {
    mutateAsync: reprocessAssetsFixMode,
    isPending: isReprocessingPending,
  } = api.admin.reprocessAssetsFixMode.useMutation({
    onSuccess: () => {
      toast({
        description: "Reprocessing enqueued",
      });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        description: e.message,
      });
    },
  });

  const {
    mutateAsync: reRunInferenceOnAllBookmarks,
    isPending: isInferencePending,
  } = api.admin.reRunInferenceOnAllBookmarks.useMutation({
    onSuccess: () => {
      toast({
        description: "Inference jobs enqueued",
      });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        description: e.message,
      });
    },
  });

  const { mutateAsync: tidyAssets, isPending: isTidyAssetsPending } =
    api.admin.tidyAssets.useMutation({
      onSuccess: () => {
        toast({
          description: "Tidy assets request has been enqueued!",
        });
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: e.message,
        });
      },
    });

  return {
    crawlActions: [
      {
        label: t("admin.background_jobs.actions.recrawl_failed_links_only"),
        onClick: () =>
          recrawlLinks({ crawlStatus: "failure", runInference: true }),
        variant: "secondary" as const,
        loading: isRecrawlPending,
      },
      {
        label: t("admin.background_jobs.actions.recrawl_all_links"),
        onClick: () => recrawlLinks({ crawlStatus: "all", runInference: true }),
        loading: isRecrawlPending,
      },
      {
        label: `${t("admin.background_jobs.actions.recrawl_all_links")} (${t("admin.background_jobs.actions.without_inference")})`,
        onClick: () =>
          recrawlLinks({ crawlStatus: "all", runInference: false }),
        loading: isRecrawlPending,
      },
    ],
    inferenceActions: [
      {
        label: t(
          "admin.background_jobs.actions.regenerate_ai_tags_for_failed_bookmarks_only",
        ),
        onClick: () =>
          reRunInferenceOnAllBookmarks({ type: "tag", status: "failure" }),
        variant: "secondary" as const,
        loading: isInferencePending,
      },
      {
        label: t(
          "admin.background_jobs.actions.regenerate_ai_tags_for_all_bookmarks",
        ),
        onClick: () =>
          reRunInferenceOnAllBookmarks({ type: "tag", status: "all" }),
        loading: isInferencePending,
      },
      {
        label: t(
          "admin.background_jobs.actions.regenerate_ai_summaries_for_failed_bookmarks_only",
        ),
        onClick: () =>
          reRunInferenceOnAllBookmarks({
            type: "summarize",
            status: "failure",
          }),
        variant: "secondary" as const,
        loading: isInferencePending,
      },
      {
        label: t(
          "admin.background_jobs.actions.regenerate_ai_summaries_for_all_bookmarks",
        ),
        onClick: () =>
          reRunInferenceOnAllBookmarks({ type: "summarize", status: "all" }),
        loading: isInferencePending,
      },
    ],
    indexingActions: [
      {
        label: t("admin.background_jobs.actions.reindex_all_bookmarks"),
        onClick: () => reindexBookmarks(),
        loading: isReindexPending,
      },
    ],
    assetPreprocessingActions: [
      {
        label: t("admin.background_jobs.actions.reprocess_assets_fix_mode"),
        onClick: () => reprocessAssetsFixMode(),
        loading: isReprocessingPending,
      },
    ],
    tidyAssetsActions: [
      {
        label: t("admin.background_jobs.actions.clean_assets"),
        onClick: () => tidyAssets(),
        loading: isTidyAssetsPending,
      },
    ],
  };
}

export default function BackgroundJobs() {
  const { t } = useTranslation();
  const { data: serverStats } = api.admin.backgroundJobsStats.useQuery(
    undefined,
    {
      refetchInterval: 1000,
      placeholderData: keepPreviousData,
    },
  );

  const actions = useJobActions();

  if (!serverStats) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <JobCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  const jobs = [
    {
      title: t("admin.background_jobs.jobs.crawler.title"),
      icon: Globe,
      stats: serverStats.crawlStats,
      description: t("admin.background_jobs.jobs.crawler.description"),
      actions: actions.crawlActions,
    },
    {
      title: t("admin.background_jobs.jobs.inference.title"),
      icon: Sparkle,
      stats: serverStats.inferenceStats,
      description: t("admin.background_jobs.jobs.inference.description"),
      actions: actions.inferenceActions,
    },
    {
      title: t("admin.background_jobs.jobs.indexing.title"),
      icon: Search,
      stats: { queued: serverStats.indexingStats.queued },
      description: t("admin.background_jobs.jobs.indexing.description"),
      actions: actions.indexingActions,
    },
    {
      title: t("admin.background_jobs.jobs.asset_preprocessing.title"),
      icon: Image,
      stats: { queued: serverStats.assetPreprocessingStats.queued },
      description: t(
        "admin.background_jobs.jobs.asset_preprocessing.description",
      ),
      actions: actions.assetPreprocessingActions,
    },
    {
      title: t("admin.background_jobs.jobs.tidy_assets.title"),
      icon: Database,
      stats: { queued: serverStats.tidyAssetsStats.queued },
      description: t("admin.background_jobs.jobs.tidy_assets.description"),
      actions: actions.tidyAssetsActions,
    },
    {
      title: t("admin.background_jobs.jobs.video.title"),
      icon: Video,
      stats: { queued: serverStats.videoStats.queued },
      description: t("admin.background_jobs.jobs.video.description"),
      actions: [],
    },
    {
      title: t("admin.background_jobs.jobs.webhook.title"),
      icon: Webhook,
      stats: { queued: serverStats.webhookStats.queued },
      description: t("admin.background_jobs.jobs.webhook.description"),
      actions: [],
    },
    {
      title: t("admin.background_jobs.jobs.feed.title"),
      icon: Rss,
      stats: { queued: serverStats.feedStats.queued },
      description: t("admin.background_jobs.jobs.feed.description"),
      actions: [],
    },
  ];

  return (
    <div className="space-y-6">
      <AdminCard className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("admin.background_jobs.background_jobs")}
          </h2>
          <p className="text-muted-foreground">
            {t("admin.background_jobs.monitor_and_manage")}
          </p>
        </div>

        <JobStatusExplanation />
      </AdminCard>

      <div className="grid gap-6 xl:grid-cols-2">
        {jobs.map((job, index) => (
          <JobCard
            key={index}
            title={job.title}
            icon={job.icon}
            stats={job.stats}
            description={job.description}
            actions={job.actions}
          />
        ))}
      </div>
    </div>
  );
}
