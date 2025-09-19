import React from "react";
import { redirect } from "next/navigation";
import { AdminNotices } from "@/components/admin/AdminNotices";
import MobileSidebar from "@/components/shared/sidebar/MobileSidebar";
import Sidebar from "@/components/shared/sidebar/Sidebar";
import SidebarLayout from "@/components/shared/sidebar/SidebarLayout";
import { getServerAuthSession } from "@/server/auth";
import { TFunction } from "i18next";
import { Activity, ArrowLeft, Settings, Users } from "lucide-react";

const adminSidebarItems = (
  t: TFunction,
): {
  name: string;
  icon: React.ReactElement;
  path: string;
}[] => [
  {
    name: t("settings.back_to_app"),
    icon: <ArrowLeft size={18} />,
    path: "/dashboard/bookmarks",
  },
  {
    name: t("admin.server_stats.server_stats"),
    icon: <Activity size={18} />,
    path: "/admin/overview",
  },
  {
    name: t("admin.users_list.users_list"),
    icon: <Users size={18} />,
    path: "/admin/users",
  },
  {
    name: t("admin.background_jobs.background_jobs"),
    icon: <Settings size={18} />,
    path: "/admin/background_jobs",
  },
];

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  if (!session || session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <SidebarLayout
      sidebar={<Sidebar items={adminSidebarItems} />}
      mobileSidebar={<MobileSidebar items={adminSidebarItems} />}
    >
      <div className="flex flex-col gap-1">
        <AdminNotices />
        {children}
      </div>
    </SidebarLayout>
  );
}
