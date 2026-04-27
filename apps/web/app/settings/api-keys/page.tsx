import type { Metadata } from "next";
import AddApiKey from "@/components/settings/AddApiKey";
import ApiKeySettings from "@/components/settings/ApiKeySettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { useTranslation } from "@/lib/i18n/server";
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
  return (
    <SettingsPage
      title={t("settings.api_keys.api_keys")}
      action={<AddApiKey isAdmin={isAdmin} />}
    >
      <ApiKeySettings isAdmin={isAdmin} />
    </SettingsPage>
  );
}
