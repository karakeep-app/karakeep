import type { Metadata } from "next";
import ReadingSettings from "@/components/settings/ReadingSettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.reading.title")} | Karakeep`,
  };
}

export default async function ReadingPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <SettingsPage
      title={t("settings.reading.title")}
      description={t("settings.info.reader_settings.description")}
    >
      <ReadingSettings />
    </SettingsPage>
  );
}
