import type { Metadata } from "next";
import FeedSettings, { FeedsEditorDialog } from "@/components/settings/FeedSettings";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { Rss } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.feeds.rss_subscriptions")} | Karakeep`,
  };
}

export default async function FeedSettingsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Rss className="size-5" />}
        title={t("settings.feeds.rss_subscriptions")}
        actions={<FeedsEditorDialog />}
      />
      <FeedSettings />
    </div>
  );
}
