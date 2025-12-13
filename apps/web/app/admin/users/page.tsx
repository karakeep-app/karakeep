import type { Metadata } from "next";
import UserList from "@/components/admin/UserList";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/i18n/server";
import { Users } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("admin.users_list.users_list")} | Karakeep`,
  };
}

export default async function AdminUsersPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Users className="size-5" />}
        title={t("admin.users_list.users_list")}
      />
      <UserList />
    </div>
  );
}
