import type { Metadata } from "next";
import ApiKeySettings from "@/components/settings/ApiKeySettings";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { KeyRound } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.api_keys.api_keys")} | Karakeep`,
  };
}

export default async function ApiKeysPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<KeyRound className="size-5" />}
        title={t("settings.api_keys.api_keys")}
      />
      <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
        <ApiKeySettings />
      </div>
    </div>
  );
}
