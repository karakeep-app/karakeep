import type { Metadata } from "next";
import BackgroundJobs from "@/components/admin/BackgroundJobs";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("admin.background_jobs.background_jobs")} | Karakeep`,
  };
}

export default function BackgroundJobsPage() {
  return <BackgroundJobs />;
}
