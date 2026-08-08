import { Suspense } from "react";
import { redirect } from "next/navigation";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import ErrorFallback from "@/components/dashboard/ErrorFallback";
import DenseSidebar from "@/components/dashboard/dense/DenseSidebar";
import { DenseScaleProvider } from "@/components/dashboard/dense/DenseScaleController";
import { ForceDenseTheme } from "@/components/dashboard/dense/ForceDenseTheme";
import MobileSidebar from "@/components/shared/sidebar/MobileSidebar";
import { Separator } from "@/components/ui/separator";
import LoadingSpinner from "@/components/ui/spinner";
import DemoModeBanner from "@/components/DemoModeBanner";
import ValidAccountCheck from "@/components/utils/ValidAccountCheck";
import { ReaderSettingsProvider } from "@/lib/readerSettings";
import { UserSettingsContextProvider } from "@/lib/userSettings";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";
import { TRPCError } from "@trpc/server";
import { TFunction } from "i18next";
import {
  Archive,
  ClipboardList,
  Highlighter,
  Home,
  Search,
  Tag,
} from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";

import serverConfig from "@karakeep/shared/config";
import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import { tryCatch } from "@karakeep/shared/tryCatch";

import "./dense-theme.css";

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

export default async function Dashboard({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  const searchEnabled = PluginManager.isRegistered(PluginType.Search);

  const [lists, userSettings, tags] = await Promise.all([
    tryCatch(api.lists.list()),
    tryCatch(api.users.settings()),
    tryCatch(api.tags.list({ limit: 10, sortBy: "usage" })),
  ]);

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

  if (lists.error) {
    throw lists.error;
  }

  const items = (t: TFunction) =>
    [
      {
        name: t("common.home"),
        icon: <Home size={18} />,
        path: "/dashboard/bookmarks",
      },
      searchEnabled
        ? [
            {
              name: t("common.search"),
              icon: <Search size={18} />,
              path: "/dashboard/search",
            },
          ]
        : [],
      {
        name: t("common.tags"),
        icon: <Tag size={18} />,
        path: "/dashboard/tags",
      },
      {
        name: t("common.highlights"),
        icon: <Highlighter size={18} />,
        path: "/dashboard/highlights",
      },
      {
        name: t("common.archive"),
        icon: <Archive size={18} />,
        path: "/dashboard/archive",
      },
    ].flat();

  const mobileSidebar = (t: TFunction) => [
    ...items(t),
    {
      name: t("lists.all_lists"),
      icon: <ClipboardList size={18} />,
      path: "/dashboard/lists",
    },
  ];

  return (
    <UserSettingsContextProvider userSettings={userSettings.data}>
      <ReaderSettingsProvider>
        <DenseScaleProvider>
          <div
            className={`k-dense k-dense-zoom dark ${plexSans.variable} ${plexMono.variable} sm:fixed sm:inset-0 sm:overflow-hidden`}
          >
            {/* Radix portals (dropdowns/dialogs) escape this wrapper in the
              DOM, so mirror its theme classes onto <html> too. */}
            <ForceDenseTheme
              fontClassNames={`${plexSans.variable} ${plexMono.variable}`}
            />
            {/* h-full, not 100dvh: under `zoom` the wrapper above already
              resolves to exactly the viewport, whereas viewport units would
              be re-divided by the zoom factor and overflow. */}
            <div className="flex min-h-[100dvh] w-full flex-col sm:h-full sm:min-h-0 sm:flex-row sm:overflow-hidden">
              <ValidAccountCheck />
              <div className="hidden flex-none sm:flex">
                <DenseSidebar
                  searchEnabled={searchEnabled}
                  initialLists={lists.data.lists}
                  initialTags={tags.error ? [] : tags.data.tags}
                  serverVersion={serverConfig.serverVersion}
                />
              </div>
              <main className="bg-k-bg flex-1 sm:min-h-0 sm:overflow-y-auto">
                {serverConfig.demoMode && <DemoModeBanner />}
                <div className="block w-full bg-background sm:hidden">
                  <MobileSidebar items={mobileSidebar} />
                  <Separator />
                </div>
                {modal}
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
        </DenseScaleProvider>
      </ReaderSettingsProvider>
    </UserSettingsContextProvider>
  );
}
