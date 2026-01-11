"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminCard } from "@/components/admin/AdminCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InfoTooltip from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { formatBytes } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  FileText,
  FileType,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  User,
  XCircle,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { toast } from "sonner";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

export default function BookmarkDebugger() {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const [bookmarkId, setBookmarkId] = useQueryState(
    "bookmarkId",
    parseAsString.withDefault(""),
  );
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);

  // Sync input value with URL on mount/change
  useEffect(() => {
    if (bookmarkId) {
      setInputValue(bookmarkId);
    }
  }, [bookmarkId]);

  const {
    data: debugInfo,
    isLoading,
    error,
  } = api.admin.getBookmarkDebugInfo.useQuery(
    { bookmarkId: bookmarkId },
    { enabled: !!bookmarkId && bookmarkId.length > 0 },
  );

  const handleLookup = () => {
    if (inputValue.trim()) {
      setBookmarkId(inputValue.trim());
    }
  };

  const recrawlMutation = api.admin.adminRecrawlBookmark.useMutation({
    onSuccess: () => {
      toast.success(t("admin.admin_tools.action_success"), {
        description: t("admin.admin_tools.recrawl_queued"),
      });
    },
    onError: (error) => {
      toast.error(t("admin.admin_tools.action_failed"), {
        description: error.message,
      });
    },
  });

  const reindexMutation = api.admin.adminReindexBookmark.useMutation({
    onSuccess: () => {
      toast.success(t("admin.admin_tools.action_success"), {
        description: t("admin.admin_tools.reindex_queued"),
      });
    },
    onError: (error) => {
      toast.error(t("admin.admin_tools.action_failed"), {
        description: error.message,
      });
    },
  });

  const retagMutation = api.admin.adminRetagBookmark.useMutation({
    onSuccess: () => {
      toast.success(t("admin.admin_tools.action_success"), {
        description: t("admin.admin_tools.retag_queued"),
      });
    },
    onError: (error) => {
      toast.error(t("admin.admin_tools.action_failed"), {
        description: error.message,
      });
    },
  });

  const resummarizeMutation = api.admin.adminResummarizeBookmark.useMutation({
    onSuccess: () => {
      toast.success(t("admin.admin_tools.action_success"), {
        description: t("admin.admin_tools.resummarize_queued"),
      });
    },
    onError: (error) => {
      toast.error(t("admin.admin_tools.action_failed"), {
        description: error.message,
      });
    },
  });

  const handleRecrawl = () => {
    if (bookmarkId) {
      recrawlMutation.mutate({ bookmarkId });
    }
  };

  const handleReindex = () => {
    if (bookmarkId) {
      reindexMutation.mutate({ bookmarkId });
    }
  };

  const handleRetag = () => {
    if (bookmarkId) {
      retagMutation.mutate({ bookmarkId });
    }
  };

  const handleResummarize = () => {
    if (bookmarkId) {
      resummarizeMutation.mutate({ bookmarkId });
    }
  };

  const getStatusBadge = (status: "pending" | "failure" | "success" | null) => {
    if (!status) return null;

    const config = {
      success: {
        variant: "default" as const,
        icon: CheckCircle2,
      },
      failure: {
        variant: "destructive" as const,
        icon: XCircle,
      },
      pending: {
        variant: "secondary" as const,
        icon: AlertCircle,
      },
    };

    const { variant, icon: Icon } = config[status];

    return (
      <Badge variant={variant}>
        <Icon className="mr-1 h-3 w-3" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Input Section */}
      <AdminCard>
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {t("admin.admin_tools.bookmark_debugger")}
          </h2>
          <InfoTooltip className="text-muted-foreground" size={16}>
            Some data will be redacted for privacy.
          </InfoTooltip>
        </div>
        <div className="flex gap-2">
          <div className="relative max-w-md flex-1">
            <Database className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("admin.admin_tools.bookmark_id_placeholder")}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleLookup();
                }
              }}
              className="pl-9"
            />
          </div>
          <Button onClick={handleLookup} disabled={!inputValue.trim()}>
            <Search className="mr-2 h-4 w-4" />
            {t("admin.admin_tools.lookup")}
          </Button>
        </div>
      </AdminCard>

      {/* Loading State */}
      {isLoading && (
        <AdminCard>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </AdminCard>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <AdminCard>
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <XCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-destructive">
                {t("admin.admin_tools.fetch_error")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {error.message}
              </p>
            </div>
          </div>
        </AdminCard>
      )}

      {/* Debug Info Display */}
      {!isLoading && !error && debugInfo && (
        <AdminCard>
          <div className="space-y-4">
            {/* Basic Info & Status */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Basic Info */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">
                    {t("admin.admin_tools.basic_info")}
                  </h3>
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Database className="h-3.5 w-3.5" />
                      {t("common.id")}
                    </span>
                    <span className="font-mono text-xs">{debugInfo.id}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <FileType className="h-3.5 w-3.5" />
                      {t("common.type")}
                    </span>
                    <Badge variant="secondary">{debugInfo.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <LinkIcon className="h-3.5 w-3.5" />
                      {t("common.source")}
                    </span>
                    <span>{debugInfo.source || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      {t("admin.admin_tools.owner_user_id")}
                    </span>
                    <span className="font-mono text-xs">
                      {debugInfo.userId}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {t("common.created_at")}
                    </span>
                    <span className="text-xs">
                      {formatDistanceToNow(new Date(debugInfo.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  {debugInfo.modifiedAt && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {t("common.updated_at")}
                      </span>
                      <span className="text-xs">
                        {formatDistanceToNow(new Date(debugInfo.modifiedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">
                    {t("admin.admin_tools.status")}
                  </h3>
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Tag className="h-3.5 w-3.5" />
                      {t("admin.admin_tools.tagging_status")}
                    </span>
                    {getStatusBadge(debugInfo.taggingStatus)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      {t("admin.admin_tools.summarization_status")}
                    </span>
                    {getStatusBadge(debugInfo.summarizationStatus)}
                  </div>
                  {debugInfo.linkInfo && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <RefreshCw className="h-3.5 w-3.5" />
                          {t("admin.admin_tools.crawl_status")}
                        </span>
                        {getStatusBadge(debugInfo.linkInfo.crawlStatus)}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <LinkIcon className="h-3.5 w-3.5" />
                          {t("admin.admin_tools.crawl_status_code")}
                        </span>
                        <Badge
                          variant={
                            debugInfo.linkInfo.crawlStatusCode === null ||
                            (debugInfo.linkInfo.crawlStatusCode >= 200 &&
                              debugInfo.linkInfo.crawlStatusCode < 300)
                              ? "default"
                              : "destructive"
                          }
                        >
                          {debugInfo.linkInfo.crawlStatusCode}
                        </Badge>
                      </div>
                      {debugInfo.linkInfo.crawledAt && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {t("admin.admin_tools.crawled_at")}
                          </span>
                          <span className="text-xs">
                            {formatDistanceToNow(
                              new Date(debugInfo.linkInfo.crawledAt),
                              {
                                addSuffix: true,
                              },
                            )}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            {(debugInfo.title ||
              debugInfo.summary ||
              debugInfo.linkInfo ||
              debugInfo.textInfo?.sourceUrl ||
              debugInfo.assetInfo) && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">
                    {t("admin.admin_tools.content")}
                  </h3>
                </div>
                <div className="space-y-3 text-sm">
                  {debugInfo.title && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        {t("common.title")}
                      </div>
                      <div className="rounded border bg-background px-3 py-2 font-medium">
                        {debugInfo.title}
                      </div>
                    </div>
                  )}
                  {debugInfo.summary && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t("admin.admin_tools.summary")}
                      </div>
                      <div className="rounded border bg-background px-3 py-2">
                        {debugInfo.summary}
                      </div>
                    </div>
                  )}
                  {debugInfo.linkInfo && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <LinkIcon className="h-3.5 w-3.5" />
                        {t("admin.admin_tools.url")}
                      </div>
                      <Link
                        prefetch={false}
                        href={debugInfo.linkInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded border bg-background px-3 py-2 text-primary hover:underline"
                      >
                        <span className="break-all">
                          {debugInfo.linkInfo.url}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                      </Link>
                    </div>
                  )}
                  {debugInfo.textInfo?.sourceUrl && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <LinkIcon className="h-3.5 w-3.5" />
                        {t("admin.admin_tools.source_url")}
                      </div>
                      <Link
                        prefetch={false}
                        href={debugInfo.textInfo.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded border bg-background px-3 py-2 text-primary hover:underline"
                      >
                        <span className="break-all">
                          {debugInfo.textInfo.sourceUrl}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                      </Link>
                    </div>
                  )}
                  {debugInfo.assetInfo && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {t("admin.admin_tools.asset_type")}
                      </div>
                      <div className="rounded border bg-background px-3 py-2">
                        <Badge variant="secondary" className="mb-1">
                          {debugInfo.assetInfo.assetType}
                        </Badge>
                        {debugInfo.assetInfo.fileName && (
                          <div className="mt-1 font-mono text-xs text-muted-foreground">
                            {debugInfo.assetInfo.fileName}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* HTML Preview */}
            {debugInfo.linkInfo && debugInfo.linkInfo.htmlContentPreview && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <button
                  onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                  className="flex w-full items-center gap-2 text-sm font-semibold hover:opacity-70"
                >
                  {showHtmlPreview ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {t("admin.admin_tools.html_preview")}
                </button>
                {showHtmlPreview && (
                  <pre className="mt-3 max-h-60 overflow-auto rounded-md border bg-muted p-3 text-xs">
                    {debugInfo.linkInfo.htmlContentPreview}
                  </pre>
                )}
              </div>
            )}

            {/* Tags */}
            {debugInfo.tags.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">
                    {t("common.tags")}{" "}
                    <span className="text-muted-foreground">
                      ({debugInfo.tags.length})
                    </span>
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {debugInfo.tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={
                        tag.attachedBy === "ai" ? "default" : "secondary"
                      }
                      className="gap-1.5"
                    >
                      {tag.attachedBy === "ai" && (
                        <Sparkles className="h-3 w-3" />
                      )}
                      <span>{tag.name}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Assets */}
            {debugInfo.assets.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">
                    {t("common.attachments")}{" "}
                    <span className="text-muted-foreground">
                      ({debugInfo.assets.length})
                    </span>
                  </h3>
                </div>
                <div className="space-y-2 text-sm">
                  {debugInfo.assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between rounded-md border bg-background p-3"
                    >
                      <div className="flex items-center gap-3">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Badge variant="secondary" className="text-xs">
                            {asset.assetType}
                          </Badge>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatBytes(asset.size)}
                          </div>
                        </div>
                      </div>
                      {asset.url && (
                        <Link
                          prefetch={false}
                          href={asset.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-primary hover:underline"
                        >
                          {t("admin.admin_tools.view")}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="rounded-lg border border-dashed bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t("common.actions")}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleRecrawl}
                  disabled={
                    debugInfo.type !== BookmarkTypes.LINK ||
                    recrawlMutation.isPending
                  }
                  size="sm"
                  variant="outline"
                >
                  {recrawlMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {t("admin.admin_tools.recrawl")}
                </Button>
                <Button
                  onClick={handleReindex}
                  disabled={reindexMutation.isPending}
                  size="sm"
                  variant="outline"
                >
                  {reindexMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  {t("admin.admin_tools.reindex")}
                </Button>
                <Button
                  onClick={handleRetag}
                  disabled={retagMutation.isPending}
                  size="sm"
                  variant="outline"
                >
                  {retagMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Tag className="mr-2 h-4 w-4" />
                  )}
                  {t("admin.admin_tools.retag")}
                </Button>
                <Button
                  onClick={handleResummarize}
                  disabled={
                    debugInfo.type !== BookmarkTypes.LINK ||
                    resummarizeMutation.isPending
                  }
                  size="sm"
                  variant="outline"
                >
                  {resummarizeMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {t("admin.admin_tools.resummarize")}
                </Button>
              </div>
            </div>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
