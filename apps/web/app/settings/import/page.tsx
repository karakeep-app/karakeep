import type { Metadata } from "next";
import ImportExport from "@/components/settings/ImportExport";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.import.import_export")} | Karakeep`,
  };
}

export default function ImportSettingsPage() {
  return <ImportExport />;
}
