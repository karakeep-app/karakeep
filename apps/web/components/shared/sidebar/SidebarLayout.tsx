import Header from "@/components/dashboard/header/Header";
import DemoModeBanner from "@/components/DemoModeBanner";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
      <SidebarProvider>
        <div className="flex min-h-[calc(100vh-64px)] w-screen">
          <ValidAccountCheck />
          {sidebar}
          <SidebarInset>
            <main className="flex-1 bg-muted">
              {serverConfig.demoMode && <DemoModeBanner />}
              <div className="block w-full md:hidden">
                {mobileSidebar}
                <Separator />
              </div>
              {modal}
              <div className="min-h-30 container p-4">{children}</div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
