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
      return "bg-gray-100 text-gray-800";
    case "in_progress":
      return "bg-blue-100 text-blue-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "failed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
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
  const { data: liveStats } = useImportSessionStats(session.id);
  const deleteSession = useDeleteImportSession();

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
            <p className="mt-1 text-sm text-gray-600">
              Created{" "}
              {formatDistanceToNow(session.createdAt, { addSuffix: true })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(stats.status)}>
              {getStatusIcon(stats.status)}
              <span className="ml-1 capitalize">
                {stats.status.replace("_", " ")}
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
                Progress
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
                    className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    <Clock className="mr-1.5 h-3 w-3" />
                    {stats.pendingBookmarks} pending
                  </Badge>
                )}
                {stats.processingBookmarks > 0 && (
                  <Badge
                    variant="secondary"
                    className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
                  >
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    {stats.processingBookmarks} processing
                  </Badge>
                )}
                {stats.completedBookmarks > 0 && (
                  <Badge
                    variant="secondary"
                    className="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                  >
                    <CheckCircle2 className="mr-1.5 h-3 w-3" />
                    {stats.completedBookmarks} completed
                  </Badge>
                )}
                {stats.failedBookmarks > 0 && (
                  <Badge
                    variant="secondary"
                    className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                  >
                    <AlertCircle className="mr-1.5 h-3 w-3" />
                    {stats.failedBookmarks} failed
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
                  Imported to:
                </span>
                <Link
                  href={`/dashboard/lists/${session.rootListId}`}
                  className="flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
                  target="_blank"
                >
                  View List
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
                  title="Delete Import Session"
                  description={
                    <div>
                      Are you sure you want to delete &quot;{session.name}
                      &quot;? This action cannot be undone. The bookmarks
                      themselves will not be deleted.
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
                      Delete Session
                    </Button>
                  )}
                >
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteSession.isPending}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
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
