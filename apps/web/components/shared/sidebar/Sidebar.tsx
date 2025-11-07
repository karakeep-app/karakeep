import Link from "next/link";
import { useTranslation } from "@/lib/i18n/server";
import { TFunction } from "i18next";

import serverConfig from "@karakeep/shared/config";

import SidebarItem from "./SidebarItem";
import { TSidebarItem } from "./TSidebarItem";

export default async function Sidebar({
  items,
  extraSections,
}: {
  items: (t: TFunction) => TSidebarItem[];
  extraSections?: React.ReactNode;
}) {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <aside className="flex h-[calc(100vh-64px)] w-60 flex-col gap-5 border-r p-4">
      <div>
        <ul className="space-y-2 text-sm">
          {items(t).map((item) => (
            <SidebarItem
              key={item.name}
              logo={item.icon}
              name={item.name}
              path={item.path}
            />
          ))}
        </ul>
      </div>
      {extraSections}
      <Link
        href={
          serverConfig.serverVersion === "nightly"
            ? `https://github.com/karakeep-app/karakeep`
            : `https://github.com/karakeep-app/karakeep/releases/tag/v${serverConfig.serverVersion}`
        }
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto flex items-center border-t pt-2 text-sm text-gray-400 hover:underline"
      >
        Karakeep v{serverConfig.serverVersion}
      </Link>
    </aside>
  );
}
