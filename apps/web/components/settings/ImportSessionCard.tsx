"use client";

import Link from "next/link";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  useDeleteImportSession,
  useImportSessionStats,
} from "@/lib/hooks/useImportSessions";
import { useTranslation } from "@/lib/i18n/client";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";

import type { ZImportSessionWithStats } from "@karakeep/shared/types/importSessions";

interface ImportSessionCardProps {
  session: ZImportSessionWithStats;
}

function getStatusColor(status: string) {
  switch (status) {
    case "pending":
      return "bg-muted text-muted-foreground";
    case "in_progress":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
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
    case "pending":
      return <Clock className="h-4 w-4" />;
    case "in_progress":
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4" />;
    case "failed":
      return <AlertCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

export function ImportSessionCard({ session }: ImportSessionCardProps) {
  const { t } = useTranslation();
  const { data: liveStats } = useImportSessionStats(session.id);
  const deleteSession = useDeleteImportSession();

  const statusLabels: Record<string, string> = {
    pending: t("settings.import_sessions.status.pending"),
    in_progress: t("settings.import_sessions.status.in_progress"),
    completed: t("settings.import_sessions.status.completed"),
    failed: t("settings.import_sessions.status.failed"),
  };

  // Use live stats if available, otherwise fallback to session stats
  const stats = liveStats || session;
  const progress =
    stats.totalBookmarks > 0
      ? ((stats.completedBookmarks + stats.failedBookmarks) /
          stats.totalBookmarks) *
        100
      : 0;

  const canDelete = stats.status !== "in_progress";

  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-medium">{session.name}</h3>
            <p className="mt-1 text-sm text-accent-foreground">
              {t("settings.import_sessions.created_at", {
                time: formatDistanceToNow(session.createdAt, {
                  addSuffix: true,
                }),
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={`${getStatusColor(stats.status)} hover:bg-inherit`}
            >
              {getStatusIcon(stats.status)}
              <span className="ml-1 capitalize">
                {statusLabels[stats.status] ?? stats.status.replace("_", " ")}
              </span>
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Progress Section */}
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
            {stats.totalBookmarks > 0 && (
              <Progress value={progress} className="h-3" />
            )}
          </div>

          {/* Stats Breakdown */}
          {stats.totalBookmarks > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
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
              </div>
            </div>
          )}

          {/* Root List Link */}
          {session.rootListId && (
            <div className="rounded-lg border bg-muted/50 p-3 dark:bg-muted/20">
              <div className="flex items-center gap-2 text-sm">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">
                  {t("settings.import_sessions.imported_to")}
                </span>
                <Link
                  href={`/dashboard/lists/${session.rootListId}`}
                  className="flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
                  target="_blank"
                >
                  {t("settings.import_sessions.view_list")}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          {/* Message */}
          {stats.message && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground dark:bg-muted/20">
              {stats.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end pt-2">
            <div className="flex items-center gap-2">
              {canDelete && (
                <ActionConfirmingDialog
                  title={t("settings.import_sessions.delete_dialog_title")}
                  description={
                    <div>
                      {t("settings.import_sessions.delete_dialog_description", {
                        name: session.name,
                      })}
                    </div>
                  }
                  actionButton={(setDialogOpen) => (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        deleteSession.mutateAsync({
                          importSessionId: session.id,
                        });
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
      </CardContent>
    </Card>
  );
}
