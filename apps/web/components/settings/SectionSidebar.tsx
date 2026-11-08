import SidebarItem from "@/components/shared/sidebar/SidebarItem";
import SidebarVersion from "@/components/shared/sidebar/SidebarVersion";
import { useTranslation } from "@/lib/i18n/server";
import { ArrowLeft } from "lucide-react";

import serverConfig from "@karakeep/shared/config";

import type { SectionNavGroup } from "./SectionNav";

/** The desktop sidebar of settings and admin: back-to-app, then the groups. */
export default async function SectionSidebar({
  groups,
}: {
  groups: SectionNavGroup[];
}) {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <aside className="flex h-[calc(100vh-64px)] w-60 flex-col gap-4 overflow-y-auto p-4 xl:w-72">
      <ul className="text-sm">
        <SidebarItem
          logo={<ArrowLeft className="size-4" />}
          name={t("settings.back_to_app")}
          path="/dashboard/bookmarks"
        />
      </ul>
      {groups.map((group, index) => (
        <div key={group.label ?? index} className="space-y-1">
          {group.label && (
            <h2 className="px-3 text-xs font-medium text-muted-foreground">
              {group.label}
            </h2>
          )}
          <ul className="space-y-0.5 text-sm">
            {group.items.map((item) => (
              <SidebarItem
                key={item.path}
                logo={item.icon}
                name={item.name}
                path={item.path}
              />
            ))}
          </ul>
        </div>
      ))}
      <SidebarVersion
        serverVersion={serverConfig.serverVersion}
        changeLogVersion={serverConfig.changelogVersion}
      />
    </aside>
  );
}
