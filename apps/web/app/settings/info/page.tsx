import type { Metadata } from "next";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import UserDetails from "@/components/settings/UserDetails";
import UserOptions from "@/components/settings/UserOptions";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.info.user_info")} | Karakeep`,
  };
}

export default async function InfoPage() {
  return (
    <div className="flex flex-col gap-4">
      <UserDetails />
      <ChangePassword />
      <UserOptions />
      <DeleteAccount />
    </div>
  );
}
