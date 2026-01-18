import type { Metadata } from "next";
import { Suspense } from "react";
import InvitesList from "@/components/admin/InvitesList";
import InvitesListSkeleton from "@/components/admin/InvitesListSkeleton";
import UserList from "@/components/admin/UserList";
import UserListSkeleton from "@/components/admin/UserListSkeleton";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("admin.users_list.users_list")} | Karakeep`,
  };
}

export default function AdminUsersPage() {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<UserListSkeleton />}>
        <UserList />
      </Suspense>
      <Suspense fallback={<InvitesListSkeleton />}>
        <InvitesList />
      </Suspense>
    </div>
  );
}
