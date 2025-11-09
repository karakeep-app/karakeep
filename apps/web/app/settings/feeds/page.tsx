import type { Metadata } from "next";
import FeedSettings from "@/components/settings/FeedSettings";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.feeds.rss_subscriptions")} | Karakeep`,
  };
}

export default function FeedSettingsPage() {
  return <FeedSettings />;
}
