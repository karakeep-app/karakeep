import { redirect } from "next/navigation";
import MobileSidebar from "@/components/shared/sidebar/MobileSidebar";
import Sidebar from "@/components/shared/sidebar/Sidebar";
import SidebarLayout from "@/components/shared/sidebar/SidebarLayout";
import { ReaderSettingsProvider } from "@/lib/readerSettings";
import { UserSettingsContextProvider } from "@/lib/userSettings";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";
import { TRPCError } from "@trpc/server";
import { TFunction } from "i18next";
import {
  ArrowLeft,
  BarChart3,
  CloudDownload,
  CreditCard,
  Download,
  GitBranch,
  Image,
  KeyRound,
  Link,
  Rss,
  Sparkles,
  User,
  Webhook,
} from "lucide-react";

import serverConfig from "@karakeep/shared/config";
import { tryCatch } from "@karakeep/shared/tryCatch";

const settingsSidebarItems = (
  t: TFunction,
): {
  name: string;
  icon: React.ReactElement;
  path: string;
}[] => {
  return [
    {
      name: t("settings.back_to_app"),
      icon: <ArrowLeft size={18} />,
      path: "/dashboard/bookmarks",
    },
    {
      name: t("settings.info.user_info"),
      icon: <User size={18} />,
      path: "/settings/info",
    },
    {
      name: t("settings.stats.usage_statistics"),
      icon: <BarChart3 size={18} />,
      path: "/settings/stats",
    },
    ...(serverConfig.stripe.isConfigured
      ? [
          {
            name: t("settings.subscription.subscription"),
            icon: <CreditCard size={18} />,
            path: "/settings/subscription",
          },
        ]
      : []),
    ...(serverConfig.inference.isConfigured
      ? [
          {
            name: t("settings.ai.ai_settings"),
            icon: <Sparkles size={18} />,
            path: "/settings/ai",
          },
        ]
      : []),
    {
      name: t("settings.feeds.rss_subscriptions"),
      icon: <Rss size={18} />,
      path: "/settings/feeds",
    },
    {
      name: t("settings.backups.backups"),
      icon: <CloudDownload size={18} />,
      path: "/settings/backups",
    },
    {
      name: t("settings.import.import_export"),
      icon: <Download size={18} />,
      path: "/settings/import",
    },
    {
      name: t("settings.api_keys.api_keys"),
      icon: <KeyRound size={18} />,
      path: "/settings/api-keys",
    },
    {
      name: t("settings.broken_links.broken_links"),
      icon: <Link size={18} />,
      path: "/settings/broken-links",
    },
    {
      name: t("settings.webhooks.webhooks"),
      icon: <Webhook size={18} />,
      path: "/settings/webhooks",
    },
    {
      name: t("settings.rules.rules"),
      icon: <GitBranch size={18} />,
      path: "/settings/rules",
    },
    {
      name: t("settings.manage_assets.manage_assets"),
      icon: <Image size={18} />,
      path: "/settings/assets",
    },
  ];
};

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

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
          sidebar={<Sidebar items={settingsSidebarItems} />}
          mobileSidebar={<MobileSidebar items={settingsSidebarItems} />}
        >
          {children}
        </SidebarLayout>
      </ReaderSettingsProvider>
    </UserSettingsContextProvider>
  );
}
