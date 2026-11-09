import type { Metadata } from "next";
import AddApiKey from "@/components/settings/AddApiKey";
import ApiKeySettings from "@/components/settings/ApiKeySettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";

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
  const session = await getServerAuthSession();
  const isAdmin = session?.user.role === "admin";
  const { keys } = await api.apiKeys.list();
  return (
    <SettingsPage
      title={t("settings.api_keys.api_keys")}
      description={t("settings.api_keys.page_description")}
      // The empty state carries this action when there are no keys yet.
      action={keys.length > 0 ? <AddApiKey isAdmin={isAdmin} /> : undefined}
    >
      <ApiKeySettings isAdmin={isAdmin} keys={keys} />
    </SettingsPage>
  );
}
