import type { TFunction } from "i18next";
import {
  ArrowDownUp,
  BarChart3,
  CreditCard,
  DatabaseBackup,
  HardDrive,
  KeyRound,
  Link2Off,
  Paintbrush,
  Rss,
  Sparkles,
  User,
  Webhook,
  Workflow,
} from "lucide-react";

import serverConfig from "@karakeep/shared/config";

import type { SectionNavGroup } from "./SectionNav";

/** Where `/settings` lands when there's room for the sidebar. */
export const SETTINGS_HOME = "/settings/info";

export function settingsNavGroups(t: TFunction): SectionNavGroup[] {
  return [
    {
      label: t("settings.groups.account"),
      items: [
        {
          name: t("settings.info.user_info"),
          icon: <User className="size-4" />,
          path: "/settings/info",
        },
        {
          name: t("settings.stats.usage_statistics"),
          icon: <BarChart3 className="size-4" />,
          path: "/settings/stats",
        },
        ...(serverConfig.stripe.isConfigured ||
        serverConfig.revenueCat.isConfigured
          ? [
              {
                name: t("settings.subscription.subscription"),
                icon: <CreditCard className="size-4" />,
                path: "/settings/subscription",
              },
            ]
          : []),
      ],
    },
    {
      label: t("settings.groups.preferences"),
      items: [
        ...(serverConfig.inference.isConfigured
          ? [
              {
                name: t("settings.ai.ai_settings"),
                icon: <Sparkles className="size-4" />,
                path: "/settings/ai",
              },
            ]
          : []),
      ],
    },
    {
      label: t("settings.groups.data"),
      items: [
        {
          name: t("settings.import.import_export"),
          icon: <ArrowDownUp className="size-4" />,
          path: "/settings/import",
        },
        {
          name: t("settings.backups.page_title"),
          icon: <DatabaseBackup className="size-4" />,
          path: "/settings/backups",
        },
        {
          name: t("settings.manage_assets.manage_assets"),
          icon: <HardDrive className="size-4" />,
          path: "/settings/assets",
        },
        {
          name: t("settings.broken_links.broken_links"),
          icon: <Link2Off className="size-4" />,
          path: "/settings/broken-links",
        },
        {
          name: t("cleanups.cleanups"),
          icon: <Paintbrush className="size-4" />,
          path: "/settings/cleanups",
        },
      ],
    },
    {
      label: t("settings.groups.automation"),
      items: [
        {
          name: t("settings.feeds.rss_subscriptions"),
          icon: <Rss className="size-4" />,
          path: "/settings/feeds",
        },
        {
          name: t("settings.rules.rules"),
          icon: <Workflow className="size-4" />,
          path: "/settings/rules",
        },
        {
          name: t("settings.webhooks.webhooks"),
          icon: <Webhook className="size-4" />,
          path: "/settings/webhooks",
        },
        {
          name: t("settings.api_keys.api_keys"),
          icon: <KeyRound className="size-4" />,
          path: "/settings/api-keys",
        },
      ],
    },
  ];
}
