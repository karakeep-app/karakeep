import type { Metadata } from "next";
import UserList from "@/components/admin/UserList";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("admin.users_list.users_list")} | Karakeep`,
  };
}

export default function AdminUsersPage() {
  return <UserList />;
}
