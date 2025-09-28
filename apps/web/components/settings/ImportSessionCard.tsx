"use client";

import { useState } from "react";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  useDeleteImportSession,
  useImportSessionStats,
  useStartImportSessionProcessing,
} from "@/lib/hooks/useImportSessions";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
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
  const [showDetails, setShowDetails] = useState(false);
  const { data: liveStats } = useImportSessionStats(session.id);
  const startProcessing = useStartImportSessionProcessing();
  const deleteSession = useDeleteImportSession();

  // Use live stats if available, otherwise fallback to session stats
  const stats = liveStats || session;
  const progress =
    stats.totalBookmarks > 0
      ? (stats.completedBookmarks / stats.totalBookmarks) * 100
      : 0;

  const canStart = stats.status === "pending" && stats.totalBookmarks > 0;
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
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progress</span>
              <span>
                {stats.completedBookmarks} / {stats.totalBookmarks} bookmarks
              </span>
            </div>
            {stats.totalBookmarks > 0 && (
              <Progress value={progress} className="h-2" />
            )}
          </div>

          {/* Stats Breakdown */}
          {(stats.totalBookmarks > 0 || showDetails) && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {stats.pendingBookmarks > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Pending:</span>
                  <span>{stats.pendingBookmarks}</span>
                </div>
              )}
              {stats.processingBookmarks > 0 && (
                <div className="flex justify-between">
                  <span className="text-blue-600">Processing:</span>
                  <span>{stats.processingBookmarks}</span>
                </div>
              )}
              {stats.completedBookmarks > 0 && (
                <div className="flex justify-between">
                  <span className="text-green-600">Completed:</span>
                  <span>{stats.completedBookmarks}</span>
                </div>
              )}
              {stats.failedBookmarks > 0 && (
                <div className="flex justify-between">
                  <span className="text-red-600">Failed:</span>
                  <span>{stats.failedBookmarks}</span>
                </div>
              )}
            </div>
          )}

          {/* Message */}
          {stats.message && (
            <div className="rounded bg-gray-50 p-2 text-sm text-gray-600">
              {stats.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? "Hide" : "Show"} Details
            </Button>

            <div className="flex items-center gap-2">
              {canStart && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() =>
                    startProcessing.mutateAsync({ importSessionId: session.id })
                  }
                  disabled={startProcessing.isPending}
                >
                  <Play className="mr-1 h-4 w-4" />
                  Start Processing
                </Button>
              )}

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
