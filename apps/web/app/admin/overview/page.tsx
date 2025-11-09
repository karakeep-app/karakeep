import type { Metadata } from "next";
import BasicStats from "@/components/admin/BasicStats";
import ServiceConnections from "@/components/admin/ServiceConnections";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("admin.admin_settings")} | Karakeep`,
  };
}

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <BasicStats />
      <ServiceConnections />
    </div>
  );
}
