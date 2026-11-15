import React from "react";
import { redirect } from "next/navigation";
import { AdminNotices } from "@/components/admin/AdminNotices";
import AdminsOnly from "@/components/admin/AdminsOnly";
import { adminNavGroups } from "@/components/admin/adminNav";
import { SectionMobileBar } from "@/components/settings/SectionNav";
import SectionSidebar from "@/components/settings/SectionSidebar";
import SidebarLayout from "@/components/shared/sidebar/SidebarLayout";
import { useTranslation } from "@/lib/i18n/server";
import { getServerAuthSession } from "@/server/auth";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }
  if (session.user.role !== "admin") {
    return <AdminsOnly />;
  }
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <SidebarLayout
      sidebar={<SectionSidebar groups={adminNavGroups(t)} />}
      mobileSidebar={null}
    >
      <SectionMobileBar
        indexPath="/admin"
        indexLabel={t("admin.admin_settings")}
        backToAppLabel={t("settings.back_to_app")}
      />
      <div className="flex flex-col gap-1">
        <AdminNotices />
        {children}
      </div>
    </SidebarLayout>
  );
}
