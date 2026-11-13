import { redirect } from "next/navigation";
import { SectionMobileBar } from "@/components/settings/SectionNav";
import SectionSidebar from "@/components/settings/SectionSidebar";
import { settingsNavGroups } from "@/components/settings/settingsNav";
import SidebarLayout from "@/components/shared/sidebar/SidebarLayout";
import { useTranslation } from "@/lib/i18n/server";
import { ReaderSettingsProvider } from "@/lib/readerSettings";
import { UserSettingsContextProvider } from "@/lib/userSettings";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";
import { TRPCError } from "@trpc/server";

import { tryCatch } from "@karakeep/shared/tryCatch";

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const userSettings = await tryCatch(api.users.settings());

  if (userSettings.error) {
    if (userSettings.error instanceof TRPCError) {
      if (
        userSettings.error.code === "NOT_FOUND" ||
        userSettings.error.code === "UNAUTHORIZED"
      ) {
        redirect("/logout");
      }
    }
    throw userSettings.error;
  }

  return (
    <UserSettingsContextProvider userSettings={userSettings.data}>
      <ReaderSettingsProvider>
        <SidebarLayout
          sidebar={<SectionSidebar groups={settingsNavGroups(t)} />}
          mobileSidebar={null}
        >
          <SectionMobileBar
            indexPath="/settings"
            indexLabel={t("settings.user_settings")}
            backToAppLabel={t("settings.back_to_app")}
          />
          {children}
        </SidebarLayout>
      </ReaderSettingsProvider>
    </UserSettingsContextProvider>
  );
}
