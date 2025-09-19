import { useTranslation } from "@/lib/i18n/server";
import { TFunction } from "i18next";

import MobileSidebarItem from "./ModileSidebarItem";
import { TSidebarItem } from "./TSidebarItem";

export default async function MobileSidebar({
  items,
}: {
  items: (t: TFunction) => TSidebarItem[];
}) {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <aside className="w-full overflow-x-auto">
      <ul className="flex justify-between space-x-2 border-b-black px-5 py-2 pt-5">
        {items(t).map((item) => (
          <MobileSidebarItem
            key={item.name}
            logo={item.icon}
            path={item.path}
          />
        ))}
      </ul>
    </aside>
  );
}
