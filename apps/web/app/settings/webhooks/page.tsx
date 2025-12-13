import type { Metadata } from "next";
import WebhookSettings from "@/components/settings/WebhookSettings";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { Webhook } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.webhooks.webhooks")} | Karakeep`,
  };
}

export default async function WebhookSettingsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Webhook className="size-5" />}
        title={t("settings.webhooks.webhooks")}
      />
      <WebhookSettings />
    </div>
  );
}
