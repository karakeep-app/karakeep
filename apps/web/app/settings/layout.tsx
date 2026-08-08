import { Suspense } from "react";
import { redirect } from "next/navigation";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import ErrorFallback from "@/components/dashboard/ErrorFallback";
import { DenseScaleProvider } from "@/components/dashboard/dense/DenseScaleController";
import DenseSettingsSidebar from "@/components/dashboard/dense/DenseSettingsSidebar";
import { DenseThemeProvider } from "@/components/dashboard/dense/DenseThemeController";
import { ForceDenseTheme } from "@/components/dashboard/dense/ForceDenseTheme";
import MobileSidebar from "@/components/shared/sidebar/MobileSidebar";
import { Separator } from "@/components/ui/separator";
import LoadingSpinner from "@/components/ui/spinner";
import DemoModeBanner from "@/components/DemoModeBanner";
import ValidAccountCheck from "@/components/utils/ValidAccountCheck";
import { useTranslation } from "@/lib/i18n/server";
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
  Link as LinkIcon,
  Rss,
  Sparkles,
  User,
  Webhook,
} from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";

import serverConfig from "@karakeep/shared/config";
import { tryCatch } from "@karakeep/shared/tryCatch";

// Same dark, warm-neutral palette as /dashboard — this is not a second
// theme, just the fork applied to the other half of the app. See
// dashboard/dense-theme.css's own comment for what these tokens mean.
import "../dashboard/dense-theme.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-k-sans",
  fallback: ["sans-serif"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-k-mono",
  fallback: ["monospace"],
});

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
      icon: <ArrowLeft size={15} strokeWidth={1.75} />,
      path: "/dashboard/bookmarks",
    },
    {
      name: t("settings.info.user_info"),
      icon: <User size={15} strokeWidth={1.75} />,
      path: "/settings/info",
    },
    {
      name: t("settings.stats.usage_statistics"),
      icon: <BarChart3 size={15} strokeWidth={1.75} />,
      path: "/settings/stats",
    },
    ...(serverConfig.stripe.isConfigured
      ? [
          {
            name: t("settings.subscription.subscription"),
            icon: <CreditCard size={15} strokeWidth={1.75} />,
            path: "/settings/subscription",
          },
        ]
      : []),
    ...(serverConfig.inference.isConfigured
      ? [
          {
            name: t("settings.ai.ai_settings"),
            icon: <Sparkles size={15} strokeWidth={1.75} />,
            path: "/settings/ai",
          },
        ]
      : []),
    {
      name: t("settings.feeds.rss_subscriptions"),
      icon: <Rss size={15} strokeWidth={1.75} />,
      path: "/settings/feeds",
    },
    {
      name: t("settings.backups.backups"),
      icon: <CloudDownload size={15} strokeWidth={1.75} />,
      path: "/settings/backups",
    },
    {
      name: t("settings.import.import_export"),
      icon: <Download size={15} strokeWidth={1.75} />,
      path: "/settings/import",
    },
    {
      name: t("settings.api_keys.api_keys"),
      icon: <KeyRound size={15} strokeWidth={1.75} />,
      path: "/settings/api-keys",
    },
    {
      name: t("settings.broken_links.broken_links"),
      icon: <LinkIcon size={15} strokeWidth={1.75} />,
      path: "/settings/broken-links",
    },
    {
      name: t("settings.webhooks.webhooks"),
      icon: <Webhook size={15} strokeWidth={1.75} />,
      path: "/settings/webhooks",
    },
    {
      name: t("settings.rules.rules"),
      icon: <GitBranch size={15} strokeWidth={1.75} />,
      path: "/settings/rules",
    },
    {
      name: t("settings.manage_assets.manage_assets"),
      icon: <Image size={15} strokeWidth={1.75} />,
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
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

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
        <DenseScaleProvider>
          <DenseThemeProvider>
            <div
              className={`k-dense k-dense-zoom dark ${plexSans.variable} ${plexMono.variable} sm:fixed sm:inset-0 sm:overflow-hidden`}
            >
              <ForceDenseTheme
                fontClassNames={`${plexSans.variable} ${plexMono.variable}`}
              />
              <div className="flex min-h-[100dvh] w-full flex-col sm:h-full sm:min-h-0 sm:flex-row sm:overflow-hidden">
                <ValidAccountCheck />
                <div className="hidden flex-none sm:flex">
                  <DenseSettingsSidebar
                    items={settingsSidebarItems(t)}
                    serverVersion={serverConfig.serverVersion}
                  />
                </div>
                <main className="bg-k-bg flex-1 sm:min-h-0 sm:overflow-y-auto">
                  {serverConfig.demoMode && <DemoModeBanner />}
                  <div className="block w-full bg-background sm:hidden">
                    <MobileSidebar items={settingsSidebarItems} />
                    <Separator />
                  </div>
                  <div className="min-h-30 p-4">
                    <ErrorBoundary fallback={<ErrorFallback />}>
                      <Suspense fallback={<LoadingSpinner />}>
                        {children}
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </main>
              </div>
            </div>
          </DenseThemeProvider>
        </DenseScaleProvider>
      </ReaderSettingsProvider>
    </UserSettingsContextProvider>
  );
}
