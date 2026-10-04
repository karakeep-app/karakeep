import { useRouter } from "expo-router";
import {
  SettingsGroup,
  SettingsNavigationRow,
  SettingsScreen,
  SettingsSeparator,
  SettingsToggleRow,
} from "@/components/settings/settings-list";
import useAppSettings from "@/lib/settings";

export default function ReaderViewSettings() {
  const router = useRouter();
  const { settings, setSettings, isLoading } = useAppSettings();

  return (
    <SettingsScreen>
      <SettingsGroup header="Reader">
        <SettingsNavigationRow
          label="Text and layout"
          onPress={() => router.push("/dashboard/settings/reader-settings")}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          label="Reader toolbar"
          onPress={() => router.push("/dashboard/settings/toolbar-settings")}
        />
      </SettingsGroup>

      <SettingsGroup header="Behavior">
        <SettingsToggleRow
          disabled={isLoading}
          label="Keep screen awake"
          onValueChange={(keepScreenOnWhileReading) =>
            setSettings({ ...settings, keepScreenOnWhileReading })
          }
          value={settings.keepScreenOnWhileReading}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
