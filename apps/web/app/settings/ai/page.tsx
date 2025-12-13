import type { Metadata } from "next";
import AISettings from "@/components/settings/AISettings";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { Sparkles } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.ai.ai_settings")} | Karakeep`,
  };
}

export default async function AISettingsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Sparkles className="size-5" />}
        title={t("settings.ai.ai_settings")}
      />
      <AISettings />
    </div>
  );
}
