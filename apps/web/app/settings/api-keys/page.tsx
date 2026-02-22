import type { Metadata } from "next";
import AddApiKey from "@/components/settings/AddApiKey";
import ApiKeySettings from "@/components/settings/ApiKeySettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { useTranslation } from "@/lib/i18n/server";

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
    <SettingsPage
      title={t("settings.api_keys.api_keys")}
      action={<AddApiKey />}
    >
      <ApiKeySettings />
    </SettingsPage>
  );
}
