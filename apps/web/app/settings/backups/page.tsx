"use client";

import BackupSettings from "@/components/settings/BackupSettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { useTranslation } from "@/lib/i18n/client";

export default function BackupsPage() {
  const { t } = useTranslation();
  return (
    <SettingsPage
      title={t("settings.backups.page_title")}
      description={t("settings.backups.page_description")}
    >
      <BackupSettings />
    </SettingsPage>
  );
}
