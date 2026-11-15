import type { TFunction } from "i18next";
import { Activity, ListChecks, Users, Wrench } from "lucide-react";

import type { SectionNavGroup } from "@/components/settings/SectionNav";

export const ADMIN_HOME = "/admin/overview";

export function adminNavGroups(t: TFunction): SectionNavGroup[] {
  return [
    {
      items: [
        {
          name: t("admin.server_stats.server_stats"),
          icon: <Activity className="size-4" />,
          path: "/admin/overview",
        },
        {
          name: t("admin.users_list.users_list"),
          icon: <Users className="size-4" />,
          path: "/admin/users",
        },
        {
          name: t("admin.background_jobs.background_jobs"),
          icon: <ListChecks className="size-4" />,
          path: "/admin/background_jobs",
        },
        {
          name: t("admin.admin_tools.admin_tools"),
          icon: <Wrench className="size-4" />,
          path: "/admin/admin_tools",
        },
      ],
    },
  ];
}
