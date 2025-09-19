import Header from "@/components/dashboard/header/Header";
import DemoModeBanner from "@/components/DemoModeBanner";
import { Separator } from "@/components/ui/separator";
import ValidAccountCheck from "@/components/utils/ValidAccountCheck";

import serverConfig from "@karakeep/shared/config";

export default function SidebarLayout({
  children,
  mobileSidebar,
  sidebar,
  modal,
}: {
  children: React.ReactNode;
  mobileSidebar: React.ReactNode;
  sidebar: React.ReactNode;
  modal?: React.ReactNode;
}) {
  return (
    <div>
      <Header />
      <div className="flex min-h-[calc(100vh-64px)] w-screen flex-col sm:h-[calc(100vh-64px)] sm:flex-row">
        <ValidAccountCheck />
        <div className="hidden flex-none sm:flex">{sidebar}</div>
        <main className="flex-1 bg-muted sm:overflow-y-auto">
          {serverConfig.demoMode && <DemoModeBanner />}
          <div className="block w-full sm:hidden">
            {mobileSidebar}
            <Separator />
          </div>
          {modal}
          <div className="min-h-30 container p-4">{children}</div>
        </main>
      </div>
    </div>
  );
}
