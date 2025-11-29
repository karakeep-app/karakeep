"use client";

import BackupSettings from "@/components/settings/BackupSettings";
import { useTranslation } from "@/lib/i18n/client";

export default function BackupsPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{t("settings.backups.page_title")}</h1>
      <p className="text-muted-foreground">
        {t("settings.backups.page_description")}
      </p>
      <BackupSettings />
    </div>
  );
}
