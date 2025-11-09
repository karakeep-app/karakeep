import type { Metadata } from "next";
import ApiKeySettings from "@/components/settings/ApiKeySettings";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.api_keys.api_keys")} | Karakeep`,
  };
}

export default async function ApiKeysPage() {
  return (
    <div className="rounded-md border bg-background p-4">
      <ApiKeySettings />
    </div>
  );
}
