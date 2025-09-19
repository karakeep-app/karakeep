"use client";

import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { Database, HardDrive } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Progress } from "../ui/progress";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

interface QuotaProgressItemProps {
  title: string;
  icon: React.ReactNode;
  used: number;
  quota: number | null;
  unlimited: boolean;
  formatter: (value: number) => string;
  description: string;
}

function QuotaProgressItem({
  title,
  icon,
  used,
  quota,
  unlimited,
  formatter,
  description,
}: QuotaProgressItemProps) {
  const { t } = useTranslation();
  const percentage =
    unlimited || !quota ? 0 : Math.min((used / quota) * 100, 100);
  const isNearLimit = percentage > 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="font-medium">{title}</h4>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{description}</span>
          <span className={isAtLimit ? "font-medium text-destructive" : ""}>
            {formatter(used)}{" "}
            {unlimited
              ? ""
              : `/ ${quota !== null && quota !== undefined ? formatter(quota) : "∞"}`}
          </span>
        </div>

        {!unlimited && quota && (
          <Progress
            value={percentage}
            className={`h-2 ${
              isAtLimit
                ? "[&>div]:bg-destructive"
                : isNearLimit
                  ? "[&>div]:bg-orange-500"
                  : ""
            }`}
          />
        )}

        {unlimited && (
          <div className="text-xs text-muted-foreground">
            {t("settings.subscription.unlimited_usage")}
          </div>
        )}

        {isAtLimit && (
          <div className="text-xs text-destructive">
            {t("settings.subscription.quota_limit_reached")}
          </div>
        )}

        {isNearLimit && !isAtLimit && (
          <div className="text-xs text-orange-600">
            {t("settings.subscription.approaching_quota_limit")}
          </div>
        )}
      </div>
    </div>
  );
}

export function QuotaProgress() {
  const { t } = useTranslation();
  const { data: quotaUsage, isLoading } =
    api.subscriptions.getQuotaUsage.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.subscription.usage_quotas")}</CardTitle>
          <CardDescription>
            {t("settings.subscription.loading_usage")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="animate-pulse space-y-2">
              <div className="h-4 w-1/3 rounded bg-muted"></div>
              <div className="h-2 rounded bg-muted"></div>
            </div>
            <div className="animate-pulse space-y-2">
              <div className="h-4 w-1/3 rounded bg-muted"></div>
              <div className="h-2 rounded bg-muted"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!quotaUsage) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.subscription.usage_quotas")}</CardTitle>
        <CardDescription>
          {t("settings.subscription.track_usage")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <QuotaProgressItem
          title="Bookmarks"
          icon={<Database className="h-4 w-4" />}
          used={quotaUsage.bookmarks.used}
          quota={quotaUsage.bookmarks.quota}
          unlimited={quotaUsage.bookmarks.unlimited}
          formatter={formatNumber}
          description={t("settings.subscription.total_bookmarks_saved")}
        />

        <QuotaProgressItem
          title="Storage"
          icon={<HardDrive className="h-4 w-4" />}
          used={quotaUsage.storage.used}
          quota={quotaUsage.storage.quota}
          unlimited={quotaUsage.storage.unlimited}
          formatter={formatBytes}
          description={t("settings.subscription.assets_file_storage")}
        />
      </CardContent>
    </Card>
  );
}
