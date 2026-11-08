import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/SettingsPage";
import UserOptions from "@/components/settings/UserOptions";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.preferences.title")} | Karakeep`,
  };
}

export default async function PreferencesPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <SettingsPage
      title={t("settings.preferences.title")}
      description={t("settings.preferences.description")}
    >
      <UserOptions />
    </SettingsPage>
  );
}
