import type { Metadata } from "next";
import BasicStats from "@/components/admin/BasicStats";
import ServiceConnections from "@/components/admin/ServiceConnections";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { Activity } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("admin.admin_settings")} | Karakeep`,
  };
}

export default async function AdminOverviewPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Activity className="size-5" />}
        title={t("admin.server_stats.server_stats")}
      />
      <div className="flex flex-col gap-6">
        <BasicStats />
        <ServiceConnections />
      </div>
    </div>
  );
}
