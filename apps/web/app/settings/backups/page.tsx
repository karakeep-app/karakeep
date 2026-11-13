import type { Metadata } from "next";
import BackupSettings from "@/components/settings/BackupSettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.backups.page_title")} | Karakeep`,
  };
}

export default async function BackupsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <SettingsPage
      title={t("settings.backups.page_title")}
      description={t("settings.backups.page_description")}
    >
      <BackupSettings />
    </SettingsPage>
  );
}
