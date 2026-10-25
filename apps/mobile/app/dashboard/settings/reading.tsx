import { useRouter } from "expo-router";
import {
  SettingsGroup,
  SettingsNavigationRow,
  SettingsScreen,
  SettingsSeparator,
  SettingsToggleRow,
} from "@/components/settings/settings-list";
import { useTranslation } from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";

export default function ReaderViewSettings() {
  const router = useRouter();
  const { settings, setSettings, isLoading } = useAppSettings();
  const { t } = useTranslation();

  return (
    <SettingsScreen>
      <SettingsGroup header={t("settings.reader_group")}>
        <SettingsNavigationRow
          label={t("settings.reader_text_layout")}
          onPress={() => router.push("/dashboard/settings/reader-settings")}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          label={t("settings.reader_toolbar")}
          onPress={() => router.push("/dashboard/settings/toolbar-settings")}
        />
      </SettingsGroup>

      <SettingsGroup header={t("settings.behavior_group")}>
        <SettingsToggleRow
          disabled={isLoading}
          label={t("settings.keep_screen_awake")}
          onValueChange={(keepScreenOnWhileReading) =>
            setSettings({ ...settings, keepScreenOnWhileReading })
          }
          value={settings.keepScreenOnWhileReading}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
