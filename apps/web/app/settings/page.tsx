import { SectionIndex } from "@/components/settings/SectionNav";
import {
  SETTINGS_HOME,
  settingsNavGroups,
} from "@/components/settings/settingsNav";
import { useTranslation } from "@/lib/i18n/server";

export default async function SettingsHomepage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <SectionIndex
      title={t("settings.user_settings")}
      groups={settingsNavGroups(t)}
      desktopPath={SETTINGS_HOME}
    />
  );
}
