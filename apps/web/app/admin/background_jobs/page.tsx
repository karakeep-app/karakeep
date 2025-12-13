import type { Metadata } from "next";
import BackgroundJobs from "@/components/admin/BackgroundJobs";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { Settings } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("admin.background_jobs.background_jobs")} | Karakeep`,
  };
}

export default async function BackgroundJobsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Settings className="size-5" />}
        title={t("admin.background_jobs.background_jobs")}
      />
      <BackgroundJobs />
    </div>
  );
}
