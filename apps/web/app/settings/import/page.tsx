import type { Metadata } from "next";
import ImportExport from "@/components/settings/ImportExport";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { Download } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.import.import_export")} | Karakeep`,
  };
}

export default async function ImportSettingsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Download className="size-5" />}
        title={t("settings.import.import_export")}
      />
      <ImportExport />
    </div>
  );
}
