import type { Metadata } from "next";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import ReaderSettings from "@/components/settings/ReaderSettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import UserAvatar from "@/components/settings/UserAvatar";
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
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <SettingsPage title={t("settings.info.user_info")}>
      <UserAvatar />
      <UserDetails />
      <ChangePassword />
      <UserOptions />
      <ReaderSettings />
      <DeleteAccount />
    </SettingsPage>
  );
}
